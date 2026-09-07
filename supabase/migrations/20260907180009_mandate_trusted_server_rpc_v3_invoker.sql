/*
# Mandate trusted RPC execution mode correction

The trusted server RPCs are callable only by service_role. Run them as
SECURITY INVOKER so the service-role database session is the effective role
and can access the locked tables without a definer-context identity mismatch.
The functions retain fixed search_path values, explicit actor checks, row
locks, and service_role-only EXECUTE grants.
*/

ALTER FUNCTION mandate_create_workspace(uuid,jsonb) SECURITY INVOKER;
ALTER FUNCTION mandate_get_user_workspaces(uuid) SECURITY INVOKER;
ALTER FUNCTION mandate_get_workspace_state(uuid,uuid) SECURITY INVOKER;
ALTER FUNCTION mandate_get_workspace_members(uuid,uuid) SECURITY INVOKER;
ALTER FUNCTION mandate_save_workspace_state(uuid,jsonb,integer,text,text) SECURITY INVOKER;
ALTER FUNCTION mandate_count_invitations(uuid,uuid) SECURITY INVOKER;
ALTER FUNCTION mandate_create_invitation(uuid,text,uuid,text,text,bigint) SECURITY INVOKER;
ALTER FUNCTION mandate_claim_invitation(text,uuid) SECURITY INVOKER;