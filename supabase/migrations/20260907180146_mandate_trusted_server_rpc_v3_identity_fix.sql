/*
# Mandate RPC identity guard correction

The trusted RPCs already have EXECUTE granted only to service_role and denied
to PUBLIC, anon, and authenticated. Their additional current_user comparison
is redundant under the PostgREST role-switching path and caused legitimate
service-role calls to fail closed as database errors. Preserve the explicit
actor ID validation and the service-role-only grant boundary, while removing
only the unreliable current_user predicate.
*/

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'mandate_create_workspace(uuid,jsonb)',
    'mandate_get_user_workspaces(uuid)',
    'mandate_get_workspace_state(uuid,uuid)',
    'mandate_get_workspace_members(uuid,uuid)',
    'mandate_save_workspace_state(uuid,jsonb,integer,text,text)',
    'mandate_count_invitations(uuid,uuid)',
    'mandate_create_invitation(uuid,text,uuid,text,text,bigint)',
    'mandate_claim_invitation(text,uuid)'
  ] LOOP
    v_oid := v_name::regprocedure;
    SELECT pg_get_functiondef(v_oid) INTO v_def;
    v_def := replace(
      v_def,
      'IF current_user <> ''service_role'' OR p_actor_id IS NULL THEN',
      'IF p_actor_id IS NULL THEN'
    );
    EXECUTE v_def;
  END LOOP;
END $$;