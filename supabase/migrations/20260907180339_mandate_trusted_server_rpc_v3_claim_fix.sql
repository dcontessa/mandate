/*
# Fix invitation claim column ambiguity

The atomic claim RPC has output parameters named `workspace_id` and
`engagement_id`. Its preparer validation used unqualified membership columns,
which PostgreSQL resolved ambiguously. Qualify the membership relation so the
single-use claim and membership insertion execute as one transaction.
*/

DO $$
DECLARE v_oid oid; v_def text;
BEGIN
  v_oid := 'mandate_claim_invitation(text,uuid)'::regprocedure;
  SELECT pg_get_functiondef(v_oid) INTO v_def;
  v_def := replace(
    v_def,
    'FROM memberships WHERE workspace_id=v_inv.workspace_id AND engagement_id=v_inv.engagement_id AND role=''preparer''',
    'FROM memberships m0 WHERE m0.workspace_id=v_inv.workspace_id AND m0.engagement_id=v_inv.engagement_id AND m0.role=''preparer'''
  );
  EXECUTE v_def;
END $$;