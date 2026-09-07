/*
# Grant RPC execution to the trusted edge-function service role

The previous hardening migration correctly revoked PUBLIC EXECUTE, but the
edge function's service_role also needs explicit execution grants. This
migration grants only service_role access to the 9 server-enforced RPCs.
Anon and authenticated remain unable to call them through PostgREST.
*/

GRANT EXECUTE ON FUNCTION create_workspace(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION get_workspace_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION get_workspace_members(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION save_workspace_state(jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION count_invitations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION create_invitation(text, uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION claim_invitation(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION get_user_workspaces() TO service_role;
GRANT EXECUTE ON FUNCTION get_invitation(text) TO service_role;