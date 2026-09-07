import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceState, Member } from "./types.ts";
import { DomainError } from "./types.ts";

export class Repository {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async state(id: string): Promise<WorkspaceState> {
    const { data, error } = await this.client
      .from("workspaces")
      .select("state")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);
    if (!data) throw new DomainError("NOT_FOUND", "Workspace unavailable.", 404);

    return data.state as WorkspaceState;
  }

  async members(id: string): Promise<Member[]> {
    const { data, error } = await this.client
      .from("memberships")
      .select("user_id, engagement_id, role")
      .eq("workspace_id", id);

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);

    return (data || []).map((r) => ({
      userId: r.user_id as string,
      engagementId: r.engagement_id as string,
      role: r.role as Member["role"],
    }));
  }

  async forUser(userId: string): Promise<{ id: string }[]> {
    const { data, error } = await this.client
      .from("memberships")
      .select("workspace_id")
      .eq("user_id", userId);

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);

    const seen = new Set<string>();
    const results: { id: string }[] = [];
    for (const r of data || []) {
      const wid = r.workspace_id as string;
      if (!seen.has(wid)) {
        seen.add(wid);
        results.push({ id: wid });
      }
    }
    return results.slice(0, 20);
  }

  async create(state: WorkspaceState): Promise<void> {
    const { error: wErr } = await this.client
      .from("workspaces")
      .insert({
        id: state.id,
        owner_id: state.ownerId,
        state: state,
        revision: 0,
      });

    if (wErr) throw new DomainError("UNAVAILABLE", "Database error.", 503);

    const { error: mErr } = await this.client
      .from("memberships")
      .insert({
        workspace_id: state.id,
        user_id: state.ownerId,
        engagement_id: "eng_alpha_sec",
        role: "preparer",
      });

    if (mErr) throw new DomainError("UNAVAILABLE", "Database error.", 503);
  }

  async save(state: WorkspaceState, expected: number): Promise<void> {
    state.revision = expected + 1;

    const { data, error } = await this.client
      .from("workspaces")
      .update({ state: state, revision: state.revision })
      .eq("id", state.id)
      .eq("revision", expected)
      .select("id")
      .maybeSingle();

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);
    if (!data)
      throw new DomainError(
        "STALE_VERSION",
        "Someone changed this workspace. Refresh and review the current version.",
      );
  }

  async countInvitations(workspaceId: string): Promise<number> {
    const { count, error } = await this.client
      .from("invitations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);
    return count || 0;
  }

  async createInvitation(
    tokenHash: string,
    workspaceId: string,
    inviterId: string,
    email: string,
    engagementId: string,
    expiresAt: number,
  ): Promise<void> {
    const { error } = await this.client.from("invitations").insert({
      token_hash: tokenHash,
      workspace_id: workspaceId,
      inviter_id: inviterId,
      email: email.toLowerCase(),
      engagement_id: engagementId,
      expires_at: expiresAt,
    });

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);
  }

  async getInvitation(
    tokenHash: string,
  ): Promise<{
    workspace_id: string;
    inviter_id: string;
    email: string;
    engagement_id: string;
    expires_at: number;
    claimed_by: string | null;
  } | null> {
    const { data, error } = await this.client
      .from("invitations")
      .select(
        "workspace_id, inviter_id, email, engagement_id, expires_at, claimed_by",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) throw new DomainError("UNAVAILABLE", "Database error.", 503);
    return data as any;
  }

  async claimInvitation(
    tokenHash: string,
    userId: string,
    now: number,
  ): Promise<{ workspace_id: string; engagement_id: string } | null> {
    // Atomically claim the invitation and create membership
    const invitation = await this.getInvitation(tokenHash);
    if (!invitation || invitation.claimed_by || invitation.expires_at <= now) {
      return null;
    }

    // Create membership
    const { error: mErr } = await this.client.from("memberships").insert({
      workspace_id: invitation.workspace_id,
      user_id: userId,
      engagement_id: invitation.engagement_id,
      role: "reviewer",
    });

    if (mErr) {
      // Check if it's a duplicate key (already a member)
      if (mErr.code !== "23505") {
        throw new DomainError("UNAVAILABLE", "Database error.", 503);
      }
    }

    // Mark invitation as claimed
    const { data: updated, error: uErr } = await this.client
      .from("invitations")
      .update({ claimed_by: userId })
      .eq("token_hash", tokenHash)
      .eq("claimed_by", null)
      .select("workspace_id, engagement_id")
      .maybeSingle();

    if (uErr) throw new DomainError("UNAVAILABLE", "Database error.", 503);
    if (!updated) return null;

    return {
      workspace_id: updated.workspace_id as string,
      engagement_id: updated.engagement_id as string,
    };
  }
}
