/*
# Serialize invitation membership changes with workspace commits

Invitation claims now lock the target workspace row before validating the
engagement and inserting reviewer membership. This uses the same workspace
row serialization boundary as aggregate saves and releases, preventing a
claim/revocation or claim/release race from committing against stale
membership state.
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

  PERFORM 1 FROM workspaces w0 WHERE w0.id = v_inv.workspace_id FOR UPDATE;

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

REVOKE EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mandate_claim_invitation(text,uuid,text) TO service_role;