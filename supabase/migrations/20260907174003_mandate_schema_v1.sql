/*
# Mandate workspace schema v1

Creates the core persistence tables for the Mandate application migrated from
Cloudflare D1/SQLite to Supabase PostgreSQL.

1. New Tables
- `workspaces`: one isolated synthetic workspace per owner. Stores the full
  workspace aggregate as JSONB with an optimistic revision counter for
  compare-and-swap concurrency control. Owner is the auth.uid() of the creator.
- `memberships`: explicit user/workspace/engagement/role rows. A user must have
  a membership row for an engagement to access it. Primary key prevents
  duplicate memberships. Indexed on user_id for fast lookup.
- `invitations`: single-use, email-bound, expiring reviewer invitations.
  Token is stored as a SHA-256 hash (never plaintext). Expires after 24 hours.
  Claimed_by tracks who accepted (null = unclaimed).

2. Security
- RLS enabled on all three tables.
- workspaces: owner can SELECT/INSERT/UPDATE their own workspace. No DELETE
  (sandbox is permanent for the account).
- memberships: authenticated users can SELECT memberships for workspaces they
  belong to. INSERT/UPDATE/DELETE denied to ordinary clients — only the server
  (service role) can create memberships (via edge function or RPC).
- invitations: authenticated users can SELECT invitations for their own
  workspaces. INSERT/UPDATE/DELETE denied to ordinary clients — only the server
  can create and claim invitations.

3. Important Notes
- The `state` column on workspaces holds the full JSONB aggregate (companies,
  engagements, documents, source review, release request, approval, receipt,
  activity events). This mirrors the original D1 design.
- Revision-based optimistic concurrency: UPDATE only succeeds when the expected
  revision matches, preventing lost updates.
- Membership checks are performed server-side on every protected operation.
  The browser never receives the full aggregate — only the server-filtered
  view for the caller's assigned engagements.
- No SECURITY DEFINER functions are exposed to the anon role. All privileged
  writes go through the edge function using the service role key.
*/

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_workspaces" ON workspaces;
CREATE POLICY "select_own_workspaces" ON workspaces FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "insert_own_workspaces" ON workspaces;
CREATE POLICY "insert_own_workspaces" ON workspaces FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_own_workspaces" ON workspaces;
CREATE POLICY "update_own_workspaces" ON workspaces FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  engagement_id text NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, engagement_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_visible_memberships" ON memberships;
CREATE POLICY "select_visible_memberships" ON memberships FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspaces WHERE workspaces.id = memberships.workspace_id AND workspaces.owner_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS invitations (
  token_hash text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  engagement_id text NOT NULL,
  expires_at bigint NOT NULL,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON invitations(workspace_id);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invitations" ON invitations;
CREATE POLICY "select_own_invitations" ON invitations FOR SELECT
  TO authenticated USING (
    inviter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspaces WHERE workspaces.id = invitations.workspace_id AND workspaces.owner_id = auth.uid()
    )
  );