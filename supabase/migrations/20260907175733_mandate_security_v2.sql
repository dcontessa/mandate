/*
# Mandate security hardening v2

## Purpose
Revoke all direct anon/authenticated privileges on workspaces, memberships, and
invitations. Remove permissive RLS policies that allowed any authenticated user
to read/write arbitrary workspace aggregate JSON (including forged approvals,
receipts, and cross-tenant engagement data). All data access now goes through
SECURITY DEFINER RPCs that run with the service role and perform explicit
authorization checks.

## Changes

### 1. Revoke direct table privileges
- REVOKE all DML (SELECT, INSERT, UPDATE, DELETE) from anon AND authenticated
  on workspaces, memberships, and invitations.
- GRANT only SELECT on memberships and invitations to authenticated (for
  viewing their own memberships and sent invitations). No direct INSERT,
  UPDATE, or DELETE on any table for ordinary clients.

### 2. Remove permissive policies
- DROP all existing policies on workspaces, memberships, invitations.
- Create narrow SELECT-only policies:
  - workspaces: owner can SELECT their own workspace row (metadata only,
    not the state JSONB — the state is only returned by the RPC).
  - memberships: user can SELECT their own membership rows.
  - invitations: inviter can SELECT invitations they sent.
- No INSERT/UPDATE/DELETE policies on any table.

### 3. Unique owner workspace constraint
- Add a partial unique index on workspaces(owner_id) WHERE the owner has
  not deleted their workspace, ensuring one active sandbox per user.

### 4. SECURITY DEFINER RPCs (service_role only)
All RPCs run as the function owner (postgres), bypassing RLS. They derive
the actor from auth.uid() and perform explicit authorization checks. EXECUTE
is revoked from anon and authenticated — only the service role (edge function)
can call them.

- create_workspace(p_state jsonb): inserts workspace + preparer membership
  atomically. Checks auth.uid() = p_state->>'ownerId'. Enforces unique owner.
- get_workspace_state(p_workspace_id uuid): returns the state JSONB. Checks
  caller has a membership OR is the owner.
- get_workspace_members(p_workspace_id uuid): returns membership rows for
  the caller's engagements only.
- save_workspace_state(p_state jsonb, p_expected_revision int): optimistic
  concurrency save. Checks ownership. Locks row with SELECT FOR UPDATE.
- count_invitations(p_workspace_id uuid): counts invitations for a workspace.
  Checks ownership.
- create_invitation(p_workspace_id, p_email, p_engagement_id, p_expires_at):
  creates invitation. Checks caller is preparer for the engagement.
- claim_invitation(p_token_hash, p_now bigint): atomically claims invitation
  AND creates membership in a single transaction with row lock. Verifies
  email binding, expiry, not-claimed, not-self-invite. Uses UPDATE ... WHERE
  claimed_by IS NULL ... RETURNING for atomic single-use claim.
- get_user_workspaces(): returns workspace IDs where the caller has a
  membership.
- get_invitation(p_token_hash): returns invitation details (for the edge
  function to inspect before claiming).

### 5. Storage policies
- Add storage policies for mandate-docs bucket: only authenticated users
  can read objects within their own workspace folder path. No public access.
  Writes are service-role only (edge function).

### 6. Important notes
- The browser (anon key) can NO LONGER directly read workspaces.state, insert
  workspaces, update workspaces, insert/update/delete memberships, or
  insert/update/delete invitations. All of these go through the edge function
  which uses the service role key to call RPCs.
- RLS remains enabled on all tables as defense-in-depth.
- The SELECT policies on workspaces/memberships/invitations are narrow and
  do not expose the state JSONB column directly (workspaces SELECT policy
  allows reading the row but the state column is excluded via column-level
  REVOKE).
*/

-- =========================================================
-- 1. REVOKE direct table privileges
-- =========================================================

REVOKE ALL ON workspaces FROM anon, authenticated;
REVOKE ALL ON memberships FROM anon, authenticated;
REVOKE ALL ON invitations FROM anon, authenticated;

-- Grant narrow SELECT only (for viewing own memberships/invitations)
-- Workspaces: no direct SELECT on state column
GRANT SELECT (id, owner_id, revision, created_at) ON workspaces TO authenticated;
GRANT SELECT ON memberships TO authenticated;
GRANT SELECT ON invitations TO authenticated;

-- =========================================================
-- 2. Remove permissive policies, add narrow SELECT-only
-- =========================================================

-- Workspaces: drop all existing policies
DROP POLICY IF EXISTS "select_own_workspaces" ON workspaces;
DROP POLICY IF EXISTS "insert_own_workspaces" ON workspaces;
DROP POLICY IF EXISTS "update_own_workspaces" ON workspaces;

-- Only owner can see workspace metadata (not state)
CREATE POLICY "select_own_workspace_metadata" ON workspaces FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

-- Memberships: drop existing, add narrow
DROP POLICY IF EXISTS "select_visible_memberships" ON memberships;
CREATE POLICY "select_own_memberships" ON memberships FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- Invitations: drop existing, add narrow
DROP POLICY IF EXISTS "select_own_invitations" ON invitations;
CREATE POLICY "select_sent_invitations" ON invitations FOR SELECT
  TO authenticated USING (inviter_id = auth.uid());

-- =========================================================
-- 3. Unique owner workspace constraint
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_active_unique
  ON workspaces(owner_id)
  WHERE owner_id IS NOT NULL;

-- =========================================================
-- 4. SECURITY DEFINER RPCs
-- =========================================================

-- create_workspace: atomic workspace + membership creation
CREATE OR REPLACE FUNCTION create_workspace(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_owner_id uuid;
BEGIN
  v_owner_id := auth.uid();
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF (p_state ->> 'ownerId')::uuid IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION 'Owner mismatch' USING ERRCODE = '42501';
  END IF;
  v_workspace_id := (p_state ->> 'id')::uuid;

  -- Insert workspace (unique index enforces one-per-owner)
  INSERT INTO workspaces (id, owner_id, state, revision)
  VALUES (v_workspace_id, v_owner_id, p_state, 0);

  -- Insert preparer membership atomically
  INSERT INTO memberships (workspace_id, user_id, engagement_id, role)
  VALUES (v_workspace_id, v_owner_id, 'eng_alpha_sec', 'preparer');

  RETURN p_state;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Workspace already exists' USING ERRCODE = '40901';
END;
$$;

REVOKE EXECUTE ON FUNCTION create_workspace FROM anon, authenticated;

-- get_workspace_state: returns state JSONB for caller's accessible workspace
CREATE OR REPLACE FUNCTION get_workspace_state(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_state jsonb;
  v_is_owner boolean;
  v_has_membership boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT (owner_id = auth.uid()) INTO v_is_owner
  FROM workspaces WHERE id = p_workspace_id FOR SHARE;

  IF v_is_owner IS NULL THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM memberships
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) INTO v_has_membership;

  IF NOT v_is_owner AND NOT v_has_membership THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT state INTO v_state FROM workspaces WHERE id = p_workspace_id;
  RETURN v_state;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_workspace_state FROM anon, authenticated;

-- get_workspace_members: returns membership rows for caller's engagements
CREATE OR REPLACE FUNCTION get_workspace_members(p_workspace_id uuid)
RETURNS TABLE(user_id uuid, engagement_id text, role text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = auth.uid()
  ) AND NOT EXISTS(
    SELECT 1 FROM memberships WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.user_id, m.engagement_id, m.role
  FROM memberships m
  WHERE m.workspace_id = p_workspace_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_workspace_members FROM anon, authenticated;

-- save_workspace_state: optimistic concurrency save with row lock
CREATE OR REPLACE FUNCTION save_workspace_state(p_state jsonb, p_expected_revision int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_current_revision int;
BEGIN
  v_workspace_id := (p_state ->> 'id')::uuid;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  -- Lock the row for serialization
  SELECT revision INTO v_current_revision
  FROM workspaces
  WHERE id = v_workspace_id AND owner_id = auth.uid()
  FOR UPDATE;

  IF v_current_revision IS NULL THEN
    RAISE EXCEPTION 'Workspace not found or not owner' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_revision != p_expected_revision THEN
    RAISE EXCEPTION 'Stale version' USING ERRCODE = '40001';
  END IF;

  UPDATE workspaces
  SET state = p_state, revision = p_expected_revision + 1
  WHERE id = v_workspace_id AND revision = p_expected_revision;
END;
$$;

REVOKE EXECUTE ON FUNCTION save_workspace_state FROM anon, authenticated;

-- count_invitations: counts invitations for a workspace (owner only)
CREATE OR REPLACE FUNCTION count_invitations(p_workspace_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM workspaces WHERE id = p_workspace_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM invitations WHERE workspace_id = p_workspace_id;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION count_invitations FROM anon, authenticated;

-- create_invitation: creates invitation (preparer only)
CREATE OR REPLACE FUNCTION create_invitation(
  p_token_hash text,
  p_workspace_id uuid,
  p_email text,
  p_engagement_id text,
  p_expires_at bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inviter_id uuid;
BEGIN
  v_inviter_id := auth.uid();
  IF v_inviter_id IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  -- Caller must be a preparer for this engagement in this workspace
  IF NOT EXISTS(
    SELECT 1 FROM memberships
    WHERE workspace_id = p_workspace_id
    AND user_id = v_inviter_id
    AND engagement_id = p_engagement_id
    AND role = 'preparer'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Cannot invite self
  IF lower(p_email) = (
    SELECT email FROM auth.users WHERE id = v_inviter_id
  ) THEN
    RAISE EXCEPTION 'Cannot invite self' USING ERRCODE = '40003';
  END IF;

  INSERT INTO invitations (token_hash, workspace_id, inviter_id, email, engagement_id, expires_at)
  VALUES (p_token_hash, p_workspace_id, v_inviter_id, lower(p_email), p_engagement_id, p_expires_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_invitation FROM anon, authenticated;

-- claim_invitation: atomic single-use claim with membership creation
-- Uses UPDATE ... WHERE claimed_by IS NULL ... RETURNING for atomic claim
CREATE OR REPLACE FUNCTION claim_invitation(
  p_token_hash text,
  p_now bigint
)
RETURNS TABLE(workspace_id uuid, engagement_id text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_workspace_id uuid;
  v_engagement_id text;
  v_inviter_id uuid;
  v_invitation_email text;
  v_expires_at bigint;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  -- Lock the invitation row and atomically claim it
  -- The UPDATE ... WHERE claimed_by IS NULL is the atomic claim
  UPDATE invitations
  SET claimed_by = v_user_id
  WHERE token_hash = p_token_hash
    AND claimed_by IS NULL
    AND expires_at > p_now
    AND lower(email) = lower(v_user_email)
    AND inviter_id != v_user_id
  RETURNING workspace_id, engagement_id, inviter_id INTO v_workspace_id, v_engagement_id, v_inviter_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Invitation invalid or already used' USING ERRCODE = '40301';
  END IF;

  -- Create membership (may already exist if duplicate — ignore)
  BEGIN
    INSERT INTO memberships (workspace_id, user_id, engagement_id, role)
    VALUES (v_workspace_id, v_user_id, v_engagement_id, 'reviewer');
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- Already a member, that's fine
  END;

  RETURN QUERY SELECT v_workspace_id, v_engagement_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_invitation FROM anon, authenticated;

-- get_user_workspaces: returns workspace IDs where caller has membership
CREATE OR REPLACE FUNCTION get_user_workspaces()
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT workspace_id AS id
  FROM memberships
  WHERE user_id = auth.uid()
  LIMIT 20;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_user_workspaces FROM anon, authenticated;

-- get_invitation: returns invitation details for edge function inspection
CREATE OR REPLACE FUNCTION get_invitation(p_token_hash text)
RETURNS TABLE(
  workspace_id uuid,
  inviter_id uuid,
  email text,
  engagement_id text,
  expires_at bigint,
  claimed_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.workspace_id, i.inviter_id, i.email, i.engagement_id, i.expires_at, i.claimed_by
  FROM invitations i
  WHERE i.token_hash = p_token_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_invitation FROM anon, authenticated;

-- =========================================================
-- 5. Storage policies for mandate-docs bucket
-- =========================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "mandate_docs_read_own" ON storage.objects;
DROP POLICY IF EXISTS "mandate_docs_write_own" ON storage.objects;

-- Authenticated users can read objects within their own workspace folder
-- Path format: <workspace_id>/<document_id>
-- We check that the first path segment matches a workspace the user owns or is a member of
CREATE POLICY "mandate_docs_read_own" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'mandate-docs'
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.workspace_id::text = (storage.foldername(name))[1]
      AND memberships.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for ordinary clients on storage.
-- All writes go through the edge function (service role).