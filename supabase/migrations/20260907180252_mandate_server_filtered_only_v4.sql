/*
# Mandate server-filtered-only table access

The earlier hardening left authenticated SELECT access on memberships and
invitations for convenience. The release requirement is stricter: ordinary
clients must not directly read any of the three tables. This migration removes
all remaining anon/authenticated table grants and SELECT policies. The edge
function remains the only application read path through service-role RPCs.
*/

REVOKE ALL ON workspaces FROM anon, authenticated;
REVOKE ALL ON memberships FROM anon, authenticated;
REVOKE ALL ON invitations FROM anon, authenticated;

DROP POLICY IF EXISTS "select_own_workspace_metadata" ON workspaces;
DROP POLICY IF EXISTS "select_own_memberships" ON memberships;
DROP POLICY IF EXISTS "select_sent_invitations" ON invitations;