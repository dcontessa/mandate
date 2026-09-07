/*
# Fix membership RPC column ambiguity

The table-returning membership RPC has an output parameter named `user_id`.
An unqualified `user_id` reference in its authorization subquery was resolved
as ambiguous, causing the edge create response to fail after the atomic
workspace insert. Qualify the membership table columns without changing the
security boundary or data model.
*/

DO $$
DECLARE v_oid oid; v_def text;
BEGIN
  v_oid := 'mandate_get_workspace_members(uuid,uuid)'::regprocedure;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  v_def := replace(
    v_def,
    'FROM memberships WHERE workspace_id=p_workspace_id AND user_id=p_actor_id',
    'FROM memberships m0 WHERE m0.workspace_id=p_workspace_id AND m0.user_id=p_actor_id'
  );
  EXECUTE v_def;
END $$;