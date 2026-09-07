import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  state: text("state").notNull(),
  revision: integer("revision").notNull().default(0),
});
export const memberships = sqliteTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id").notNull(),
    engagementId: text("engagement_id").notNull(),
    role: text("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId, t.engagementId] }),
    index("idx_memberships_user").on(t.userId),
  ],
);
export const invitations = sqliteTable(
  "invitations",
  {
    tokenHash: text("token_hash").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    inviterId: text("inviter_id").notNull(),
    email: text("email").notNull(),
    engagementId: text("engagement_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
    claimedBy: text("claimed_by"),
  },
  (t) => [index("idx_invitations_workspace").on(t.workspaceId)],
);
