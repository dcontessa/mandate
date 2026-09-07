/*
# Fix: Revoke EXECUTE from PUBLIC on all SECURITY DEFINER functions

The previous migration revoked EXECUTE from anon and authenticated, but
PostgreSQL grants EXECUTE to PUBLIC by default when a function is created.
This left all 9 SECURITY DEFINER functions callable by unauthenticated
users via the REST API. This migration revokes from PUBLIC and re-grants
only to the service_role (which the edge function uses).

## Changes
- REVOKE EXECUTE ON ALL 9 functions FROM PUBLIC
- GRANT EXECUTE TO service_role (which bypasses RLS and can call any function)
- The edge function uses the service role key, so it can call these RPCs
- Ordinary clients (anon/authenticated) cannot call any of these functions
*/

REVOKE EXECUTE ON FUNCTION create_workspace(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_workspace_state(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_workspace_members(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_workspace_state(jsonb, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION count_invitations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_invitation(text, uuid, text, text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_invitation(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_user_workspaces() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_invitation(text) FROM PUBLIC;