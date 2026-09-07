/*
# Invitation claim email binding without auth-schema reads

The edge function already verifies the bearer token through Supabase Auth and
obtains the authenticated user's email. The service-role-only claim RPC now
accepts that verified email as an argument, avoiding an auth.users read from
the transactional path while preserving the canonical lower-case email
comparison under the invitation row lock.

The prior two-argument function remains revoked and unused. The new
three-argument overload is the only one granted to service_role.
*/

CREATE OR REPLACE FUNCTION mandate_claim_invitation(
  p_token_hash text,
  p_actor_id uuid,
  p_actor_email text
)
RETURNS TABLE(workspace_id uuid, engagement_id text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv invitations%ROWTYPE;
  v_now bigint;
BEGIN
  IF p_actor_id IS NULL OR p_actor_email IS NULL OR length(p_actor_email) > 254 THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;
  v_now := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  SELECT i.* INTO v_inv
  FROM invitations i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_inv.claimed_by IS NOT NULL
     OR v_inv.expires_at <= v_now
     OR lower(v_inv.email) <> lower(p_actor_email)
     OR v_inv.inviter_id = p_actor_id THEN
    RAISE EXCEPTION 'Invitation invalid or already used' USING ERRCODE='40301';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM memberships m0
    WHERE m0.workspace_id = v_inv.workspace_id
      AND m0.engagement_id = v_inv.engagement_id
      AND m0.role = 'preparer'
  ) THEN
    RAISE EXCEPTION 'Engagement unavailable' USING ERRCODE='40302';
  END IF;

  UPDATE invitations i
  SET claimed_by = p_actor_id
  WHERE i.token_hash = p_token_hash AND i.claimed_by IS NULL;

  INSERT INTO memberships(workspace_id, user_id, engagement_id, role)
  VALUES (v_inv.workspace_id, p_actor_id, v_inv.engagement_id, 'reviewer')
  ON CONFLICT ON CONSTRAINT memberships_pkey DO NOTHING;

  RETURN QUERY SELECT v_inv.workspace_id, v_inv.engagement_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid,text) TO service_role;