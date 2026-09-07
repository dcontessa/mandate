import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceState, Member } from "./types.ts";
import { DomainError } from "./types.ts";

function mapError(error: { code?: string } | null, fallback = "Database operation failed."): never {
  if (error?.code === "40001") {
    throw new DomainError("STALE_VERSION", "Someone changed this workspace. Refresh and review the current version.", 409);
  }
  if (error?.code === "P0002") {
    throw new DomainError("NOT_FOUND", "Workspace unavailable.", 404);
  }
  if (error?.code === "42501") {
    throw new DomainError("FORBIDDEN", "Workspace unavailable.", 403);
  }
  if (error?.code === "40301") {
    throw new DomainError("INVITE_INVALID", "This invitation is expired, used or intended for another reviewer.", 403);
  }
  throw new DomainError("UNAVAILABLE", fallback, 503);
}

export class Repository {
  private client: SupabaseClient;
  private actorId: string;
  private actorEmail: string;

  constructor(client: SupabaseClient, actorId: string, actorEmail = "") {
    this.client = client;
    this.actorId = actorId;
    this.actorEmail = actorEmail;
  }

  async state(id: string): Promise<WorkspaceState> {
    const { data, error } = await this.client.rpc("mandate_get_workspace_state", {
      p_actor_id: this.actorId,
      p_workspace_id: id,
    });
    if (error) mapError(error);
    if (!data) throw new DomainError("NOT_FOUND", "Workspace unavailable.", 404);
    return data as WorkspaceState;
  }

  async members(id: string): Promise<Member[]> {
    const { data, error } = await this.client.rpc("mandate_get_workspace_members", {
      p_actor_id: this.actorId,
      p_workspace_id: id,
    });
    if (error) mapError(error);
    return ((data || []) as Array<{ user_id: string; engagement_id: string; role: string }>).map((r) => ({
      userId: r.user_id,
      engagementId: r.engagement_id,
      role: r.role as Member["role"],
    }));
  }

  async forUser(_userId?: string): Promise<{ id: string }[]> {
    const { data, error } = await this.client.rpc("mandate_get_user_workspaces", {
      p_actor_id: this.actorId,
    });
    if (error) mapError(error);
    return ((data || []) as Array<{ id: string }>).slice(0, 20);
  }

  async create(state: WorkspaceState): Promise<void> {
    const { error } = await this.client.rpc("mandate_create_workspace", {
      p_actor_id: this.actorId,
      p_state: state,
    });
    if (error) {
      if (error.code === "40901") {
        throw new DomainError("WORKSPACE_EXISTS", "Your sandbox already exists. Refresh to open it.", 409);
      }
      mapError(error);
    }
  }

  async save(
    state: WorkspaceState,
    expected: number,
    engagementId = "eng_alpha_sec",
    action = "change_package",
  ): Promise<void> {
    state.revision = expected + 1;
    const { error } = await this.client.rpc("mandate_save_workspace_state", {
      p_actor_id: this.actorId,
      p_state: state,
      p_expected_revision: expected,
      p_engagement_id: engagementId,
      p_action: action,
    });
    if (error) mapError(error);
  }

  async countInvitations(workspaceId: string): Promise<number> {
    const { data, error } = await this.client.rpc("mandate_count_invitations", {
      p_actor_id: this.actorId,
      p_workspace_id: workspaceId,
    });
    if (error) mapError(error);
    return Number(data || 0);
  }

  async createInvitation(
    tokenHash: string,
    workspaceId: string,
    _inviterId: string,
    email: string,
    engagementId: string,
    expiresAt: number,
  ): Promise<void> {
    const { error } = await this.client.rpc("mandate_create_invitation", {
      p_actor_id: this.actorId,
      p_token_hash: tokenHash,
      p_workspace_id: workspaceId,
      p_email: email.toLowerCase(),
      p_engagement_id: engagementId,
      p_expires_at: expiresAt,
    });
    if (error) mapError(error);
  }

  async claimInvitation(
    tokenHash: string,
    _userId?: string,
    _now?: number,
    _email?: string,
  ): Promise<{ workspace_id: string; engagement_id: string } | null> {
    const { data, error } = await this.client.rpc("mandate_claim_invitation", {
      p_token_hash: tokenHash,
      p_actor_id: this.actorId,
      p_actor_email: this.actorEmail,
    });
    if (error) {
      if (error.code === "40301" || error.code === "40302") return null;
      mapError(error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { workspace_id: row.workspace_id as string, engagement_id: row.engagement_id as string } : null;
  }
}
