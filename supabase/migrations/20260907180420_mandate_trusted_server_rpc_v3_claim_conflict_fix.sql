/*
# Fix invitation claim conflict-target ambiguity

The atomic claim RPC's output parameters shadowed the column names in the
membership conflict target. Use the table's primary-key constraint explicitly
so duplicate membership handling remains atomic and unambiguous.
*/

DO $$
DECLARE v_oid oid; v_def text;
BEGIN
  v_oid := 'mandate_claim_invitation(text,uuid)'::regprocedure;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  v_def := replace(
    v_def,
    'ON CONFLICT (workspace_id,user_id,engagement_id) DO NOTHING',
    'ON CONFLICT ON CONSTRAINT memberships_pkey DO NOTHING'
  );
  EXECUTE v_def;
END $$;