import test from "node:test";
import assert from "node:assert/strict";
import fixtureBytes from "../lib/fixture-bytes.json" with { type: "json" };
import { handleApi } from "../lib/http.ts";
import type { Context } from "../lib/http.ts";
import type { WorkspaceView, Actor, Member, WorkspaceState } from "../lib/types.ts";
import { DomainError } from "../lib/types.ts";
import { digest } from "../lib/domain.ts";
import { seedWorkspace } from "../lib/seed.ts";

interface TestDB {
  workspaces: Map<string, { state: WorkspaceState; revision: number; ownerId: string }>;
  memberships: Map<string, Member>;
  invitations: Map<string, {
    workspace_id: string;
    inviter_id: string;
    email: string;
    engagement_id: string;
    expires_at: number;
    claimed_by: string | null;
  }>;
}

function memberKey(ws: string, user: string, eng: string) {
  return `${ws}:${user}:${eng}`;
}

class TestRepository {
  db: TestDB;

  constructor() {
    this.db = {
      workspaces: new Map(),
      memberships: new Map(),
      invitations: new Map(),
    };
  }

  async state(id: string): Promise<WorkspaceState> {
    const row = this.db.workspaces.get(id);
    if (!row) throw new DomainError("NOT_FOUND", "Workspace unavailable.", 404);
    return structuredClone(row.state);
  }

  async members(id: string): Promise<Member[]> {
    const result: Member[] = [];
    for (const m of this.db.memberships.values()) {
      if (m.userId && this.db.workspaces.has(id)) {
        // Check if this membership belongs to this workspace
        for (const [key, mem] of this.db.memberships) {
          if (key.startsWith(`${id}:`)) result.push({ ...mem });
        }
        break;
      }
    }
    return result.filter((m) => {
      for (const [key] of this.db.memberships) {
        if (key.startsWith(`${id}:`) && key.includes(m.userId) && key.includes(m.engagementId)) return true;
      }
      return false;
    });
  }

  async forUser(userId: string): Promise<{ id: string }[]> {
    const ids = new Set<string>();
    for (const [key] of this.db.memberships) {
      const parts = key.split(":");
      if (parts[1] === userId) ids.add(parts[0]);
    }
    return [...ids].slice(0, 20).map((id) => ({ id }));
  }

  async create(state: WorkspaceState): Promise<void> {
    this.db.workspaces.set(state.id, {
      state: structuredClone(state),
      revision: 0,
      ownerId: state.ownerId,
    });
    this.db.memberships.set(
      memberKey(state.id, state.ownerId, "eng_alpha_sec"),
      { userId: state.ownerId, engagementId: "eng_alpha_sec", role: "preparer" },
    );
  }

  async save(state: WorkspaceState, expected: number): Promise<void> {
    const row = this.db.workspaces.get(state.id);
    if (!row || row.revision !== expected) {
      throw new DomainError(
        "STALE_VERSION",
        "Someone changed this workspace. Refresh and review the current version.",
      );
    }
    state.revision = expected + 1;
    row.state = structuredClone(state);
    row.revision = state.revision;
  }

  async countInvitations(workspaceId: string): Promise<number> {
    let n = 0;
    for (const inv of this.db.invitations.values()) {
      if (inv.workspace_id === workspaceId) n++;
    }
    return n;
  }

  async createInvitation(
    tokenHash: string,
    workspaceId: string,
    inviterId: string,
    email: string,
    engagementId: string,
    expiresAt: number,
  ): Promise<void> {
    this.db.invitations.set(tokenHash, {
      workspace_id: workspaceId,
      inviter_id: inviterId,
      email: email.toLowerCase(),
      engagement_id: engagementId,
      expires_at: expiresAt,
      claimed_by: null,
    });
  }

  async getInvitation(tokenHash: string) {
    const inv = this.db.invitations.get(tokenHash);
    if (!inv) return null;
    return { ...inv };
  }

  async claimInvitation(tokenHash: string, userId: string, now: number, email?: string) {
    const inv = this.db.invitations.get(tokenHash);
    if (!inv || inv.claimed_by || inv.expires_at <= now || (email && inv.email !== email.toLowerCase())) return null;
    inv.claimed_by = userId;
    this.db.memberships.set(memberKey(inv.workspace_id, userId, inv.engagement_id), {
      userId,
      engagementId: inv.engagement_id,
      role: "reviewer",
    });
    return { workspace_id: inv.workspace_id, engagement_id: inv.engagement_id };
  }

  // Test helpers for direct membership manipulation
  addMembership(ws: string, user: string, eng: string, role: Member["role"]) {
    this.db.memberships.set(memberKey(ws, user, eng), { userId: user, engagementId: eng, role });
  }

  removeMembership(ws: string, user: string) {
    for (const key of [...this.db.memberships.keys()]) {
      if (key.startsWith(`${ws}:${user}:`)) this.db.memberships.delete(key);
    }
  }

  updateRole(ws: string, user: string, role: Member["role"]) {
    for (const [key, mem] of this.db.memberships) {
      if (key.startsWith(`${ws}:${user}:`)) {
        this.db.memberships.set(key, { ...mem, role });
      }
    }
  }
}

const preparer: Actor = {
  id: "test-preparer",
  email: "preparer@example.test",
  name: "Test preparer",
};
const reviewer: Actor = {
  id: "test-reviewer",
  email: "reviewer@example.test",
  name: "Test reviewer",
};

async function setup(t: { after: (f: () => void) => void }) {
  const repo = new TestRepository();
  const files = new Map<string, Uint8Array>();
  let clock = Date.now();

  const context = (actor: Actor | null): Context => ({
    actor,
    repo: repo as any,
    fixtureBytes,
    now: () => clock,
    files: {
      get: async (k) => files.get(k) || null,
      put: async (k, b) => {
        files.set(k, b);
      },
    },
  });

  async function call(
    path: string,
    actor: Actor | null = preparer,
    payload?: unknown,
    origin = "https://mandate.test",
  ) {
    const r = await handleApi(
      new Request(
        `https://mandate.test/api/mandate${path}`,
        payload === undefined
          ? {}
          : {
              method: "POST",
              headers: { Origin: origin, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
      ),
      context(actor),
    );
    const type = r.headers.get("Content-Type");
    return {
      status: r.status,
      body: type?.includes("json")
        ? ((await r.json()) as any)
        : new Uint8Array(await r.arrayBuffer()),
    };
  }

  const created = await call("/create", preparer, {});
  assert.equal(created.status, 201);
  let state = (created.body as WorkspaceView).workspace;

  async function cmd(
    action: string,
    actor: Actor = preparer,
    extra: Record<string, unknown> = {},
  ) {
    const result = await call("/command", actor, {
      workspaceId: state.id,
      engagementId: "eng_alpha_sec",
      revision: state.revision,
      action,
      ...extra,
    });
    if (result.body.workspace) state = result.body.workspace;
    return result;
  }

  const invite = await call("/invite", preparer, {
    workspaceId: state.id,
    engagementId: "eng_alpha_sec",
    email: reviewer.email,
  });
  assert.equal(invite.status, 201);
  const token = invite.body.invitePath.split("=")[1];
  assert.equal((await call("/join", reviewer, { token })).status, 200);

  async function approve() {
    assert.equal(
      (await cmd("review_source", reviewer, { acknowledgement: true })).status,
      200,
    );
    assert.equal(
      (await cmd("approve", reviewer, { acknowledgement: true })).status,
      200,
    );
  }

  return {
    repo,
    files,
    call,
    cmd,
    approve,
    token,
    state: () => state,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test("independent review produces one internal sandbox receipt, with no provider proof", async (t) => {
  const h = await setup(t);
  await h.approve();
  const r = await h.cmd("release");
  assert.equal(r.status, 200);
  const receipt = r.body.workspace.engagements[0].request.receipt;
  assert.ok(receipt.id);
  assert.equal(receipt.kind, "internal_sandbox");
  assert.equal(receipt.terminal3Proof, null);
  const saved = await h.repo.state(h.state().id);
  assert.equal(saved.engagements[0].request!.receipt!.id, receipt.id);
});

test("package v3 adds C: professional approval cannot override the source signatory constraint", async (t) => {
  const h = await setup(t);
  await h.approve();
  assert.equal(
    (await h.cmd("change_package", preparer, { documentId: "doc_bank_v3" }))
      .status,
    200,
  );
  const r = await h.cmd("release");
  assert.equal(r.body.blocked.code, "SIGNATORIES_NOT_AUTHORISED");
  assert.equal(h.state().engagements[0].request!.receipt, null);
});

test("package v2 keeps A+B but invalidates v1 approval", async (t) => {
  const h = await setup(t);
  await h.approve();
  await h.cmd("change_package", preparer, { documentId: "doc_bank_v2" });
  const r = await h.cmd("release");
  assert.equal(r.body.blocked.code, "SNAPSHOT_CHANGED");
  assert.equal(h.state().engagements[0].request!.receipt, null);
});

test("recipient substitution is rejected at the final record boundary", async (t) => {
  const h = await setup(t);
  await h.approve();
  await h.cmd("change_recipient", preparer, {
    destination: "sandbox_alternate",
  });
  assert.equal((await h.cmd("release")).body.blocked.code, "SNAPSHOT_CHANGED");
});

test("direct API boundaries: other company, service and tenant deny documents and commands", async (t) => {
  const h = await setup(t);
  const other = await h.call(
    "/create",
    { id: "other-tenant", email: "other@example.test", name: "Other" },
    {},
  );
  for (const [workspace, eid, doc] of [
    [h.state().id, "eng_beta_sec", "doc_bank_v1"],
    [h.state().id, "eng_alpha_acc", "doc_accounts_v1"],
    [other.body.workspace.id, "eng_alpha_sec", "doc_bank_v1"],
  ]) {
    const r = await h.call(
      `/document?workspace=${workspace}&engagement=${eid}&document=${doc}`,
    );
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "FORBIDDEN");
    assert.equal(
      (
        await h.call("/command", preparer, {
          workspaceId: workspace,
          engagementId: eid,
          revision: 0,
          action: "release",
        })
      ).status,
      403,
    );
  }
  const visible = await h.call(`?workspace=${h.state().id}`);
  assert.deepEqual(
    visible.body.workspace.engagements.map((e: { id: string }) => e.id),
    ["eng_alpha_sec"],
  );
});

test("source expiry is evaluated using server time at execution", async (t) => {
  const h = await setup(t);
  await h.approve();
  h.advance(3600001);
  assert.equal((await h.cmd("release")).body.blocked.code, "SOURCE_EXPIRED");
});

test("Terminal 3 mode fails closed even when business checks and snapshot approval pass", async (t) => {
  const h = await setup(t);
  await h.cmd("set_mode", preparer, { mode: "terminal3" });
  await h.approve();
  const r = await h.cmd("release");
  assert.equal(r.status, 503);
  assert.equal(r.body.blocked.code, "TERMINAL3_NOT_CONNECTED");
  assert.equal(h.state().engagements[0].request!.receipt, null);
});

test("retry after a lost response returns the existing internal receipt, not a second effect", async (t) => {
  const h = await setup(t);
  await h.approve();
  const revision = h.state().revision;
  const first = await h.cmd("release");
  const stale = await h.call("/command", preparer, {
    workspaceId: h.state().id,
    engagementId: "eng_alpha_sec",
    revision,
    action: "release",
  });
  assert.equal(stale.status, 409);
  const replay = await h.cmd("release");
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(
    first.body.workspace.engagements[0].request.receipt.id,
    replay.body.workspace.engagements[0].request.receipt.id,
  );
  assert.equal(
    h.state().events.filter((e) => e.outcome === "recorded").length,
    1,
  );
});

test("missing approval, preparer self-approval and agent self-approval denied", async (t) => {
  const h = await setup(t);
  await h.cmd("review_source", reviewer, { acknowledgement: true });
  assert.equal((await h.cmd("release")).body.blocked.code, "APPROVAL_REQUIRED");
  assert.equal(
    (await h.cmd("approve", preparer, { acknowledgement: true })).status,
    403,
  );
  h.repo.addMembership(h.state().id, "agent", "eng_alpha_sec", "release_agent");
  assert.equal(
    (
      await h.cmd(
        "approve",
        { id: "agent", email: "", name: "Test agent" },
        { acknowledgement: true },
      )
    ).status,
    403,
  );
  h.repo.updateRole(h.state().id, preparer.id, "reviewer");
  assert.equal(
    (await h.cmd("approve", preparer, { acknowledgement: true })).body.code,
    "SELF_APPROVAL",
  );
});

test("revoked reviewer cannot carry approval into a later execution", async (t) => {
  const h = await setup(t);
  await h.approve();
  h.repo.removeMembership(h.state().id, reviewer.id);
  assert.equal(
    (await h.cmd("release")).body.blocked.code,
    "SOURCE_NOT_REVIEWED",
  );
});

test("stored file bytes are verified before approval and release", async (t) => {
  const h = await setup(t);
  await h.approve();
  const s = await h.repo.state(h.state().id),
    d = s.engagements[0].documents.find((d) => d.id === "doc_bank_v1")!;
  h.files.set(d.key, new Uint8Array([1, 2, 3]));
  const r = await h.cmd("release");
  assert.equal(r.body.code, "DOCUMENT_INTEGRITY");
  assert.equal(
    (await h.repo.state(h.state().id)).engagements[0].request!.receipt,
    null,
  );
});

test("unauthenticated writes, CSRF origins, malformed input and unknown fields rejected", async (t) => {
  const h = await setup(t);
  assert.equal((await h.call("/create", null, {})).status, 401);
  assert.equal(
    (await h.call("/create", preparer, {}, "https://evil.test")).status,
    403,
  );
  assert.equal(
    (
      await h.call("/command", preparer, {
        workspaceId: h.state().id,
        engagementId: "eng_alpha_sec",
        revision: 0,
        action: "release",
        userId: reviewer.id,
      })
    ).status,
    400,
  );
});

test("reviewer invitations are single-use, email-bound and reject self-invites", async (t) => {
  const h = await setup(t);
  assert.equal(
    (await h.call("/join", reviewer, { token: h.token })).status,
    403,
  );
  assert.equal(
    (
      await h.call("/invite", preparer, {
        workspaceId: h.state().id,
        engagementId: "eng_alpha_sec",
        email: preparer.email,
      })
    ).status,
    400,
  );
  const invite = await h.call("/invite", preparer, {
    workspaceId: h.state().id,
    engagementId: "eng_alpha_sec",
    email: "third@example.test",
  });
  assert.equal(
    (
      await h.call(
        "/join",
        { id: "attacker", email: "wrong@example.test", name: "Wrong" },
        { token: invite.body.invitePath.split("=")[1] },
      )
    ).status,
    403,
  );
});

test("compare-and-swap stops two approved snapshot writes from winning the same revision", async (t) => {
  const h = await setup(t);
  const a = await h.repo.state(h.state().id),
    b = structuredClone(a);
  await h.repo.save(a, a.revision);
  await assert.rejects(h.repo.save(b, b.revision), { code: "STALE_VERSION" });
});

test("anonymous fixture preview has no runtime evidence and only public synthetic PDFs", async (t) => {
  const h = await setup(t);
  const r = await h.call("", null);
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, "preview");
  assert.deepEqual(r.body.workspace.events, []);
  assert.equal(r.body.workspace.engagements[0].request.approval, null);
  assert.equal(
    (await h.call("/sample?document=doc_bank_v1", null)).status,
    200,
  );
  assert.equal(
    (await h.call("/sample?document=../../secrets", null)).status,
    404,
  );
});

test("approval expiry and changed policy are blocked even when the source is current", async (t) => {
  const h = await setup(t);
  await h.approve();
  h.advance(1800001);
  assert.equal((await h.cmd("release")).body.blocked.code, "APPROVAL_EXPIRED");
  await h.approve();
  const s = await h.repo.state(h.state().id);
  s.engagements[0].request!.policyVersion = "unreviewed-policy";
  await h.repo.save(s, s.revision);
  const r = await h.call("/command", preparer, {
    workspaceId: s.id,
    engagementId: "eng_alpha_sec",
    revision: s.revision,
    action: "release",
  });
  assert.equal(r.body.blocked.code, "POLICY_CHANGED");
});
