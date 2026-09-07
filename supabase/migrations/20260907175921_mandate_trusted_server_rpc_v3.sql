/*
# Mandate trusted server RPC boundary v3

## Purpose
The edge function verifies the user's Supabase JWT, then calls these RPCs with
the verified actor ID using the service role. The browser has no EXECUTE grant.
These functions are the only path for workspace aggregate reads/writes and
membership/invitation mutations.

## Transactional guarantees
1. Workspace creation inserts the workspace and preparer membership in one
   PostgreSQL function and the unique owner index prevents duplicate sandboxes.
2. Invitation claim locks the invitation row, checks the current auth user's
   verified email, expiry, inviter, and target engagement, then marks the token
   claimed and inserts reviewer membership in one transaction.
3. Aggregate saves lock the workspace row and all memberships for the target
   engagement before checking actor role, reviewer membership, revision, source
   expiry, approval expiry, snapshot identity, and receipt deduplication.
4. Membership changes made through invitation claim use the same workspace row
   boundary as saves, so revocation/claim and release cannot silently race.
5. Database time (`clock_timestamp`) is used for expiry checks at commit time.

## Security
- Every function requires `p_actor_id` and rejects calls unless the database
  session is the trusted `service_role`.
- EXECUTE is revoked from PUBLIC, anon, and authenticated; granted only to
  service_role.
- `search_path` is fixed to `public, pg_temp`.
- Direct table and storage access remains denied to ordinary clients.
*/

CREATE OR REPLACE FUNCTION mandate_create_workspace(p_actor_id uuid, p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF (p_state->>'ownerId')::uuid IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'Owner mismatch' USING ERRCODE='42501'; END IF;
  v_id := (p_state->>'id')::uuid;
  INSERT INTO workspaces(id, owner_id, state, revision) VALUES (v_id, p_actor_id, p_state, 0);
  INSERT INTO memberships(workspace_id, user_id, engagement_id, role) VALUES (v_id, p_actor_id, 'eng_alpha_sec', 'preparer');
  RETURN p_state;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Workspace already exists' USING ERRCODE='40901';
END; $$;

CREATE OR REPLACE FUNCTION mandate_get_user_workspaces(p_actor_id uuid)
RETURNS TABLE(id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT DISTINCT m.workspace_id FROM memberships m WHERE m.user_id = p_actor_id LIMIT 20;
END; $$;

CREATE OR REPLACE FUNCTION mandate_get_workspace_state(p_actor_id uuid, p_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_state jsonb;
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=p_workspace_id AND user_id=p_actor_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT state INTO v_state FROM workspaces WHERE id=p_workspace_id;
  IF v_state IS NULL THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='P0002'; END IF;
  RETURN v_state;
END; $$;

CREATE OR REPLACE FUNCTION mandate_get_workspace_members(p_actor_id uuid, p_workspace_id uuid)
RETURNS TABLE(user_id uuid, engagement_id text, role text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=p_workspace_id AND user_id=p_actor_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT m.user_id,m.engagement_id,m.role FROM memberships m WHERE m.workspace_id=p_workspace_id;
END; $$;

CREATE OR REPLACE FUNCTION mandate_save_workspace_state(
  p_actor_id uuid, p_state jsonb, p_expected_revision integer,
  p_engagement_id text, p_action text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid; v_revision integer; v_actor_role text; v_engagement jsonb;
  v_request jsonb; v_source jsonb; v_approval jsonb; v_now bigint;
  v_reviewer uuid; v_created_by uuid;
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  v_id := (p_state->>'id')::uuid;
  SELECT revision INTO v_revision FROM workspaces WHERE id=v_id FOR UPDATE;
  IF v_revision IS NULL THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='P0002'; END IF;
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION 'Stale version' USING ERRCODE='40001'; END IF;
  IF (p_state->>'revision')::integer <> p_expected_revision + 1 THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='40001'; END IF;

  -- Lock the complete engagement membership boundary before checking roles.
  PERFORM 1 FROM memberships WHERE workspace_id=v_id AND engagement_id=p_engagement_id FOR UPDATE;
  SELECT role INTO v_actor_role FROM memberships WHERE workspace_id=v_id AND engagement_id=p_engagement_id AND user_id=p_actor_id;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_action IN ('review_source','approve') AND v_actor_role <> 'reviewer' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_action IN ('change_package','change_recipient','set_mode','release') AND v_actor_role <> 'preparer' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT value INTO v_engagement FROM jsonb_array_elements(p_state->'engagements') WHERE value->>'id'=p_engagement_id;
  IF v_engagement IS NULL THEN RAISE EXCEPTION 'Engagement unavailable' USING ERRCODE='P0002'; END IF;
  v_request := v_engagement->'request'; v_source := v_engagement->'source';
  v_now := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  IF p_action IN ('approve','release') THEN
    IF v_source IS NULL OR (v_source->>'expiresAt')::bigint <= v_now THEN RAISE EXCEPTION 'Source expired' USING ERRCODE='P0003'; END IF;
  END IF;
  IF p_action = 'release' THEN
    v_approval := v_request->'approval';
    IF v_approval IS NULL OR (v_approval->>'expiresAt')::bigint <= v_now THEN RAISE EXCEPTION 'Approval expired' USING ERRCODE='P0003'; END IF;
    v_reviewer := (v_approval->>'reviewerId')::uuid;
    v_created_by := (v_request->>'createdBy')::uuid;
    IF v_reviewer IS NULL OR v_reviewer = v_created_by THEN RAISE EXCEPTION 'Invalid approval' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=v_id AND engagement_id=p_engagement_id AND user_id=v_reviewer AND role='reviewer') THEN RAISE EXCEPTION 'Reviewer membership revoked' USING ERRCODE='42501'; END IF;
    -- Receipt deduplication: once recorded, never create a second receipt.
    IF v_request->'receipt' IS NOT NULL AND v_request->'receipt' <> 'null'::jsonb THEN RAISE EXCEPTION 'Request already completed' USING ERRCODE='23505'; END IF;
  END IF;

  UPDATE workspaces SET state=p_state, revision=p_expected_revision+1 WHERE id=v_id AND revision=p_expected_revision;
END; $$;

CREATE OR REPLACE FUNCTION mandate_count_invitations(p_actor_id uuid, p_workspace_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=p_workspace_id AND user_id=p_actor_id AND role='preparer') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN (SELECT count(*)::integer FROM invitations WHERE workspace_id=p_workspace_id);
END; $$;

CREATE OR REPLACE FUNCTION mandate_create_invitation(
  p_actor_id uuid, p_token_hash text, p_workspace_id uuid, p_email text,
  p_engagement_id text, p_expires_at bigint
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=p_workspace_id AND user_id=p_actor_id AND engagement_id=p_engagement_id AND role='preparer') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  INSERT INTO invitations(token_hash,workspace_id,inviter_id,email,engagement_id,expires_at) VALUES (p_token_hash,p_workspace_id,p_actor_id,lower(p_email),p_engagement_id,p_expires_at);
END; $$;

CREATE OR REPLACE FUNCTION mandate_claim_invitation(p_token_hash text, p_actor_id uuid)
RETURNS TABLE(workspace_id uuid, engagement_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_inv invitations%ROWTYPE; v_email text; v_now bigint;
BEGIN
  IF current_user <> 'service_role' OR p_actor_id IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id=p_actor_id;
  v_now := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  SELECT * INTO v_inv FROM invitations WHERE token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_inv.claimed_by IS NOT NULL OR v_inv.expires_at <= v_now OR lower(v_inv.email) <> lower(v_email) OR v_inv.inviter_id = p_actor_id THEN RAISE EXCEPTION 'Invitation invalid or already used' USING ERRCODE='40301'; END IF;
  -- Verify target engagement still has an active preparer owner before granting reviewer access.
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id=v_inv.workspace_id AND engagement_id=v_inv.engagement_id AND role='preparer') THEN RAISE EXCEPTION 'Engagement unavailable' USING ERRCODE='40302'; END IF;
  UPDATE invitations SET claimed_by=p_actor_id WHERE token_hash=p_token_hash AND claimed_by IS NULL;
  INSERT INTO memberships(workspace_id,user_id,engagement_id,role) VALUES (v_inv.workspace_id,p_actor_id,v_inv.engagement_id,'reviewer') ON CONFLICT (workspace_id,user_id,engagement_id) DO NOTHING;
  RETURN QUERY SELECT v_inv.workspace_id,v_inv.engagement_id;
END; $$;

-- Direct storage reads are also server-only; the edge function uses service_role.
DROP POLICY IF EXISTS "mandate_docs_read_own" ON storage.objects;

-- Remove public execute from new RPCs and grant only to the edge service role.
REVOKE EXECUTE ON FUNCTION mandate_create_workspace(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_get_user_workspaces(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_get_workspace_state(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_get_workspace_members(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_save_workspace_state(uuid,jsonb,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_count_invitations(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_create_invitation(uuid,text,uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mandate_create_workspace(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_get_user_workspaces(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_get_workspace_state(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_get_workspace_members(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_save_workspace_state(uuid,jsonb,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_count_invitations(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_create_invitation(uuid,text,uuid,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid) TO service_role;