import type { WorkspaceState, Member } from "./types.ts";
import { DomainError } from "./types.ts";
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}
export class Repository {
  readonly db: Database;
  constructor(db: Database) {
    this.db = db;
  }
  async state(id: string) {
    const row = await this.db
      .prepare("SELECT state FROM workspaces WHERE id=?")
      .bind(id)
      .first<{ state: string }>();
    if (!row) throw new DomainError("NOT_FOUND", "Workspace unavailable.", 404);
    return JSON.parse(row.state) as WorkspaceState;
  }
  async members(id: string) {
    const { results } = await this.db
      .prepare(
        "SELECT user_id as userId, engagement_id as engagementId, role FROM memberships WHERE workspace_id=?",
      )
      .bind(id)
      .all<Member>();
    return results;
  }
  async forUser(userId: string) {
    const { results } = await this.db
      .prepare(
        "SELECT DISTINCT workspace_id as id FROM memberships WHERE user_id=? LIMIT 20",
      )
      .bind(userId)
      .all<{ id: string }>();
    return results;
  }
  async create(state: WorkspaceState) {
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO workspaces(id,owner_id,state,revision) VALUES(?,?,?,0)",
        )
        .bind(state.id, state.ownerId, JSON.stringify(state)),
      this.db
        .prepare(
          "INSERT INTO memberships(workspace_id,user_id,engagement_id,role) VALUES(?,?,?,'preparer')",
        )
        .bind(state.id, state.ownerId, "eng_alpha_sec"),
    ]);
  }
  async save(state: WorkspaceState, expected: number) {
    state.revision = expected + 1;
    const result = await this.db
      .prepare(
        "UPDATE workspaces SET state=?,revision=? WHERE id=? AND revision=?",
      )
      .bind(JSON.stringify(state), state.revision, state.id, expected)
      .run();
    if (result.meta.changes !== 1)
      throw new DomainError(
        "STALE_VERSION",
        "Someone changed this workspace. Refresh and review the current version.",
      );
  }
}
