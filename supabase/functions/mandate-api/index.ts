import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.25.76";
import fixtureBytes from "./fixture-bytes.json" with { type: "json" };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function digest(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getActor(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const token = authHeader.slice(7);

  const resp = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });

  if (!resp.ok) return null;
  const user = await resp.json();
  return {
    id: user.id as string,
    email: user.email as string,
    name: (user.user_metadata?.name as string) || user.email,
  };
}

// --- Repository (inline for edge function) ---
class Repository {
  private client: ReturnType<typeof createClient>;
  private actorId: string;
  private actorEmail: string;

  constructor(client: ReturnType<typeof createClient>, actorId: string, actorEmail = "") {
    this.client = client;
    this.actorId = actorId;
    this.actorEmail = actorEmail;
  }

  async state(id: string) {
    const { data, error } = await this.client.rpc("mandate_get_workspace_state", { p_actor_id: this.actorId, p_workspace_id: id });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    if (!data) throw { code: "NOT_FOUND", message: "Workspace unavailable.", status: 404 };
    return data;
  }

  async members(id: string) {
    const { data, error } = await this.client.rpc("mandate_get_workspace_members", { p_actor_id: this.actorId, p_workspace_id: id });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    return (data || []).map((r: any) => ({ userId: r.user_id, engagementId: r.engagement_id, role: r.role }));
  }

  async forUser(_userId?: string) {
    const { data, error } = await this.client.rpc("mandate_get_user_workspaces", { p_actor_id: this.actorId });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    return (data || []).slice(0, 20).map((r: any) => ({ id: r.id }));
  }

  async create(state: any) {
    const { error } = await this.client.rpc("mandate_create_workspace", { p_actor_id: this.actorId, p_state: state });
    if (error) {
      if (error.code === "40901") throw { code: "WORKSPACE_EXISTS", message: "Your sandbox already exists. Refresh to open it.", status: 409 };
      throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    }
  }

  async save(state: any, expected: number, engagementId = "eng_alpha_sec", action = "change_package") {
    state.revision = expected + 1;
    const { error } = await this.client.rpc("mandate_save_workspace_state", { p_actor_id: this.actorId, p_state: state, p_expected_revision: expected, p_engagement_id: engagementId, p_action: action });
    if (error) {
      if (error.code === "40001") throw { code: "STALE_VERSION", message: "The workspace changed. Refresh before continuing.", status: 409 };
      throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    }
  }

  async countInvitations(ws: string) {
    const { data, error } = await this.client.rpc("mandate_count_invitations", { p_actor_id: this.actorId, p_workspace_id: ws });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    return Number(data || 0);
  }

  async createInvitation(tokenHash: string, ws: string, _inviter: string, email: string, eng: string, exp: number) {
    const { error } = await this.client.rpc("mandate_create_invitation", { p_actor_id: this.actorId, p_token_hash: tokenHash, p_workspace_id: ws, p_email: email.toLowerCase(), p_engagement_id: eng, p_expires_at: exp });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
  }

  async claimInvitation(tokenHash: string, _userId?: string, _now?: number, _email?: string) {
    const { data, error } = await this.client.rpc("mandate_claim_invitation", { p_token_hash: tokenHash, p_actor_id: this.actorId, p_actor_email: this.actorEmail });
    if (error) {
      if (error.code === "40301" || error.code === "40302") return null;
      throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { workspace_id: row.workspace_id, engagement_id: row.engagement_id } : null;
  }
}

// --- Domain logic (inline) ---
const POLICY_VERSION = "mandate-sandbox-1";
const SANDBOX_AGENT = "internal-sandbox-worker";
const EDGE_BUILD = "mandate-api-v5";

function membership(members: any[], actor: any, engagementId: string, roles?: string[]) {
  const m = members.find((m: any) => m.userId === actor.id && m.engagementId === engagementId);
  if (!m || (roles && !roles.includes(m.role)))
    throw { code: "FORBIDDEN", message: "You do not have permission for this engagement.", status: 403 };
  return m;
}

function engagement(state: any, id: string) {
  const e = state.engagements.find((x: any) => x.id === id);
  if (!e) throw { code: "NOT_FOUND", message: "Engagement unavailable.", status: 404 };
  return e;
}

function documentFor(e: any, id: string) {
  const d = e.documents.find((d: any) => d.id === id);
  if (!d) throw { code: "DOCUMENT_UNAVAILABLE", message: "Document unavailable for this engagement.", status: 404 };
  return d;
}

function exactSet(a: string[], b: string[]) {
  return a.length === b.length && new Set(a).size === a.length &&
    [...a].sort().join("|") === [...b].sort().join("|");
}

function sourceChecks(e: any, now: number, members: any[]) {
  const s = e.source, r = e.request;
  if (!s || !r) throw { code: "NO_WORKFLOW", message: "This engagement has no release workflow.", status: 409 };
  if (!s.reviewedBy || !members.some((m: any) => m.userId === s.reviewedBy && m.engagementId === e.id && m.role === "reviewer"))
    throw { code: "SOURCE_NOT_REVIEWED", message: "An authorised reviewer must establish the source authority.", status: 409 };
  if (s.reviewedBy === r.createdBy)
    throw { code: "SOURCE_SELF_REVIEW", message: "The preparer cannot review their own source authority.", status: 409 };
  if (s.expiresAt <= now)
    throw { code: "SOURCE_EXPIRED", message: "The source authority has expired. A fresh review is required.", status: 409 };
  const sourceDoc = documentFor(e, s.documentId), doc = documentFor(e, r.documentId);
  if (s.sha256 !== sourceDoc.sha256)
    throw { code: "SOURCE_CHANGED", message: "The source document has changed.", status: 409 };
  if (doc.kind !== "release_package" || !exactSet(s.signatories, doc.signatories))
    throw { code: "SIGNATORIES_NOT_AUTHORISED", message: "Only Person A and Person B jointly are authorised. This package does not match.", status: 409 };
  if (r.policyVersion !== POLICY_VERSION)
    throw { code: "POLICY_CHANGED", message: "The release policy changed. Request a fresh review.", status: 409 };
  return { source: s, request: r, doc };
}

async function snapshot(state: any, e: any, expiresAt: number) {
  const r = e.request, s = e.source, d = documentFor(e, r.documentId);
  return digest(JSON.stringify({
    tenant: state.id, company: e.companyId, engagement: e.id,
    source: s.id, sourceHash: s.sha256, sourceRevision: s.revision,
    sourceExpiry: s.expiresAt, sourceReviewer: s.reviewedBy,
    document: d.id, version: d.version, hash: d.sha256,
    signatories: [...d.signatories].sort(), action: "release",
    mode: r.mode, destination: r.destination, agent: r.agentIdentity,
    policy: r.policyVersion, approvalExpiresAt: expiresAt, requestId: r.id,
  }));
}

async function releaseChecks(state: any, e: any, members: any[], now: number) {
  const checked = sourceChecks(e, now, members);
  const a = checked.request.approval;
  if (!a) throw { code: "APPROVAL_REQUIRED", message: "An independent reviewer must approve this exact package and recipient.", status: 409 };
  if (a.reviewerId === checked.request.createdBy || !members.some((m: any) => m.userId === a.reviewerId && m.engagementId === e.id && m.role === "reviewer"))
    throw { code: "APPROVAL_INVALID", message: "The approval requires a current independent reviewer.", status: 409 };
  if (a.expiresAt <= now)
    throw { code: "APPROVAL_EXPIRED", message: "This approval has expired. Request a fresh review.", status: 409 };
  if ((await snapshot(state, e, a.expiresAt)) !== a.snapshot)
    throw { code: "SNAPSHOT_CHANGED", message: "The document, authority, agent or recipient changed after approval. Review again.", status: 409 };
  if (checked.request.mode === "terminal3")
    throw { code: "TERMINAL3_NOT_CONNECTED", message: "Terminal 3 execution is not connected. No document was released.", status: 503 };
  if (checked.request.agentIdentity !== SANDBOX_AGENT)
    throw { code: "AGENT_MISMATCH", message: "This approval is not bound to the internal sandbox worker.", status: 409 };
  return { ...checked, approval: a };
}

function event(state: any, actor: any, e: any, action: string, outcome: string, details: string, now: number) {
  if (state.events.length >= 1000)
    throw { code: "SANDBOX_EVENT_LIMIT", message: "This sandbox has reached its event limit.", status: 429 };
  state.events.push({ id: crypto.randomUUID(), at: now, actorId: actor.id, engagementId: e.id, action, outcome, details });
}

async function applyCommand(original: any, actor: any, members: any[], engagementId: string, command: any, now: number) {
  const state = structuredClone(original);
  membership(members, actor, engagementId);
  const e = engagement(state, engagementId), r = e.request;
  if (!r || !e.source)
    throw { code: "NO_WORKFLOW", message: "This service currently contains reference documents only.", status: 409 };
  const a = command.action;
  if (a === "review_source" || a === "approve") {
    membership(members, actor, e.id, ["reviewer"]);
    if (actor.id === r.createdBy)
      throw { code: "SELF_APPROVAL", message: "The preparer cannot approve their own work.", status: 403 };
    if (!command.acknowledgement)
      throw { code: "ACKNOWLEDGEMENT_REQUIRED", message: "Confirm that you reviewed the exact documents and scope.", status: 400 };
  } else membership(members, actor, e.id, ["preparer"]);
  if (r.status === "recorded" && a !== "release")
    throw { code: "REQUEST_COMPLETED", message: "This request already has a sandbox receipt; its approved snapshot is frozen.", status: 409 };
  if (a === "review_source") {
    e.source.reviewedBy = actor.id; e.source.reviewedAt = now;
    e.source.expiresAt = now + 3600000; e.source.revision++;
    if (r.approval) r.status = "needs_review";
    event(state, actor, e, a, "reviewed", "Established synthetic source: Person A + Person B jointly. Valid for one hour.", now);
  } else if (a === "approve") {
    sourceChecks(e, now, members);
    const expiresAt = Math.min(now + 1800000, e.source.expiresAt);
    r.approval = { id: crypto.randomUUID(), reviewerId: actor.id, createdAt: now, expiresAt, snapshot: await snapshot(state, e, expiresAt) };
    r.status = "approved";
    event(state, actor, e, a, "approved", "Approved the exact document, recipient and mode for 30 minutes.", now);
  } else if (a === "change_package") {
    if (!command.documentId) throw { code: "INVALID_INPUT", message: "A document is required.", status: 400 };
    r.documentId = command.documentId; r.status = "needs_review";
    if (r.approval) r.approval = null;
    event(state, actor, e, a, "changed", "Changed the release package. Previous approval is void.", now);
  } else if (a === "change_recipient") {
    if (!command.destination) throw { code: "INVALID_INPUT", message: "A destination is required.", status: 400 };
    r.destination = command.destination; r.status = "needs_review";
    if (r.approval) r.approval = null;
    event(state, actor, e, a, "changed", "Changed the recipient. Previous approval is void.", now);
  } else if (a === "set_mode") {
    if (!command.mode) throw { code: "INVALID_INPUT", message: "A mode is required.", status: 400 };
    r.mode = command.mode; r.status = "needs_review";
    if (r.approval) r.approval = null;
    event(state, actor, e, a, "changed", `Execution mode set to ${command.mode}.`, now);
  } else if (a === "release") {
    const checked = await releaseChecks(state, e, members, now);
    r.receipt = {
      id: crypto.randomUUID(), requestId: r.id, snapshot: checked.approval.snapshot,
      documentHash: checked.doc.sha256, destination: r.destination,
      recordedAt: now, kind: "internal_sandbox", terminal3Proof: null,
    };
    r.status = "recorded";
    event(state, actor, e, a, "recorded", "Internal sandbox receipt recorded. No Terminal 3 proof.", now);
    return { state, blocked: null, replayed: false };
  }
  return { state, blocked: null, replayed: false };
}

// --- Seed (inline) ---
function seedWorkspace(id: string, ownerId: string, now: number): any {
  return {
    id, ownerId, name: "Demo Practice One", createdAt: now, revision: 0,
    companies: [{ id: "co_alpha", name: "Alpha Holdings Ltd" }],
    engagements: [
      {
        id: "eng_alpha_sec", companyId: "co_alpha", service: "secretarial",
        title: "Board authority record", stage: "awaiting_review",
        documents: [
          { id: "doc_board_v1", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Approved board record", version: 1, sha256: "", signatories: ["A", "B"], key: "", kind: "source_authority" },
          { id: "doc_bank_v1", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Banking instruction package", version: 1, sha256: "", signatories: ["A", "B"], key: "", kind: "release_package" },
          { id: "doc_bank_v2", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Banking instruction package", version: 2, sha256: "", signatories: ["A", "B"], key: "", kind: "release_package" },
          { id: "doc_bank_v3", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Banking instruction package", version: 3, sha256: "", signatories: ["A", "B", "C"], key: "", kind: "release_package" },
        ],
        source: { id: "src_1", documentId: "doc_board_v1", sha256: "", signatories: ["A", "B"], reviewedBy: null, reviewedAt: null, expiresAt: 0, revision: 0 },
        request: { id: "req_1", createdBy: ownerId, documentId: "doc_bank_v1", destination: "sandbox_primary", mode: "sandbox", agentIdentity: SANDBOX_AGENT, policyVersion: POLICY_VERSION, status: "awaiting_review", approval: null, receipt: null },
      },
      {
        id: "eng_alpha_acc", companyId: "co_alpha", service: "accounting",
        title: "Management summary", stage: "reference_only",
        documents: [{ id: "doc_accounts_v1", companyId: "co_alpha", engagementId: "eng_alpha_acc", title: "Illustrative management summary", version: 1, sha256: "", signatories: [], key: "", kind: "reference" }],
        source: null, request: null,
      },
      {
        id: "eng_alpha_tax", companyId: "co_alpha", service: "taxation",
        title: "Tax document checklist", stage: "reference_only",
        documents: [{ id: "doc_tax_v1", companyId: "co_alpha", engagementId: "eng_alpha_tax", title: "Tax document checklist", version: 1, sha256: "", signatories: [], key: "", kind: "reference" }],
        source: null, request: null,
      },
    ],
    events: [],
  };
}

// Compute SHA-256 for fixture bytes
async function computeHashes() {
  const hashes: Record<string, string> = {};
  for (const [id, b64] of Object.entries(fixtureBytes)) {
    const bytes = Uint8Array.from(atob(b64 as string), (c) => c.charCodeAt(0));
    hashes[id] = await digest(bytes);
  }
  return hashes;
}

// --- API handler ---
const commandSchema = z.object({
  workspaceId: z.string().uuid(),
  engagementId: z.string().max(80),
  revision: z.number().int().nonnegative(),
  action: z.enum(["review_source", "approve", "change_package", "change_recipient", "set_mode", "release"]),
  documentId: z.string().max(80).optional(),
  destination: z.enum(["sandbox_primary", "sandbox_alternate"]).optional(),
  mode: z.enum(["sandbox", "terminal3"]).optional(),
  acknowledgement: z.boolean().optional(),
}).strict();

function response(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function actorOf(actor: any) {
  if (!actor) throw { code: "SIGN_IN_REQUIRED", message: "Sign in to access your workspace.", status: 401 };
  return actor;
}

async function scoped(repo: Repository, actor: any, id: string, eid?: string) {
  const members = await repo.members(id);
  if (eid) membership(members, actor, eid);
  else if (!members.some((m: any) => m.userId === actor.id))
    throw { code: "FORBIDDEN", message: "Workspace unavailable.", status: 403 };
  const state = await repo.state(id);
  return { actor, members, state };
}

function view(state: any, members: any[], actor: any) {
  const allowed = new Set(members.filter((m: any) => m.userId === actor.id).map((m: any) => m.engagementId));
  const engagements = state.engagements.filter((e: any) => allowed.has(e.id));
  const companies = new Set(engagements.map((e: any) => e.companyId));
  return {
    authAvailable: true, mode: "workspace", actor,
    workspace: { ...state, engagements, companies: state.companies.filter((c: any) => companies.has(c.id)), events: state.events.filter((e: any) => allowed.has(e.engagementId)) },
    memberships: members.filter((m: any) => allowed.has(m.engagementId)),
    terminal3: { connected: false, detail: "Live Terminal 3 execution has not been connected." },
    signInPath: "#signin",
  };
}

async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw { code: "INVALID_INPUT", message: "A request body is required.", status: 400 };
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 8192) { await reader.cancel(); throw { code: "BODY_TOO_LARGE", message: "Request is too large.", status: 413 }; }
    parts.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { joined.set(p, offset); offset += p.length; }
  try { return JSON.parse(new TextDecoder().decode(joined)); }
  catch { throw { code: "INVALID_JSON", message: "Invalid request body.", status: 400 }; }
}

const previewState: any = {
  id: "preview", ownerId: "", name: "Demo Practice One", createdAt: 0, revision: 0,
  companies: [{ id: "co_alpha", name: "Alpha Holdings Ltd" }],
  engagements: [
    { id: "eng_alpha_sec", companyId: "co_alpha", service: "secretarial", title: "Board authority record", stage: "awaiting_review",
      documents: [
        { id: "doc_board_v1", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Approved board record", version: 1, sha256: "", signatories: ["A", "B"], key: "preview/doc_board_v1", kind: "source_authority" },
        { id: "doc_bank_v1", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Banking instruction package", version: 1, sha256: "", signatories: ["A", "B"], key: "preview/doc_bank_v1", kind: "release_package" },
        { id: "doc_bank_v2", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Banking instruction package", version: 2, sha256: "", signatories: ["A", "B"], key: "preview/doc_bank_v2", kind: "release_package" },
        { id: "doc_bank_v3", companyId: "co_alpha", engagementId: "eng_alpha_sec", title: "Banking instruction package", version: 3, sha256: "", signatories: ["A", "B", "C"], key: "preview/doc_bank_v3", kind: "release_package" },
      ],
      source: { id: "src_1", documentId: "doc_board_v1", sha256: "", signatories: ["A", "B"], reviewedBy: null, reviewedAt: null, expiresAt: 0, revision: 0 },
      request: { id: "req_1", createdBy: "", documentId: "doc_bank_v1", destination: "sandbox_primary", mode: "sandbox", agentIdentity: SANDBOX_AGENT, policyVersion: POLICY_VERSION, status: "awaiting_review", approval: null, receipt: null },
    },
    { id: "eng_alpha_acc", companyId: "co_alpha", service: "accounting", title: "Management summary", stage: "reference_only",
      documents: [{ id: "doc_accounts_v1", companyId: "co_alpha", engagementId: "eng_alpha_acc", title: "Illustrative management summary", version: 1, sha256: "", signatories: [], key: "preview/doc_accounts_v1", kind: "reference" }],
      source: null, request: null,
    },
    { id: "eng_alpha_tax", companyId: "co_alpha", service: "taxation", title: "Tax document checklist", stage: "reference_only",
      documents: [{ id: "doc_tax_v1", companyId: "co_alpha", engagementId: "eng_alpha_tax", title: "Tax document checklist", version: 1, sha256: "", signatories: [], key: "preview/doc_tax_v1", kind: "reference" }],
      source: null, request: null,
    },
  ],
  events: [],
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/mandate-api\/?/, "");

  try {
    const actor = await getActor(request);
    const serviceClient = createServiceClient();
    const repo = new Repository(serviceClient, actor?.id ?? "", actor?.email ?? "");
    await computeHashes();

    const files = {
      get: async (key: string): Promise<Uint8Array | null> => {
        const { data, error } = await serviceClient.storage.from("mandate-docs").download(key);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      },
      put: async (key: string, bytes: Uint8Array): Promise<void> => {
        const { error } = await serviceClient.storage.from("mandate-docs").upload(key, bytes, { contentType: "application/pdf", upsert: true });
        if (error) throw error;
      },
    };

    const now = () => Date.now();

    if (request.method !== "GET") {
      if (request.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405);
      actorOf(actor);
      if (request.headers.get("Origin") !== url.origin) {
        // Allow same-origin and no-origin (edge function) requests
        if (request.headers.get("Origin")) {
          throw { code: "ORIGIN_REJECTED", message: "Request origin rejected.", status: 403 };
        }
      }
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        throw { code: "CONTENT_TYPE", message: "Use JSON requests.", status: 415 };
    }

    if (request.method === "GET" && path === "") {
      if (!actor)
        return corsResponse({ authAvailable: true, mode: "preview", actor: null, workspace: previewState, memberships: [], terminal3: { connected: false, detail: "Not connected" }, signInPath: "#signin" });
      const list = await repo.forUser(actor.id);
      const selected = url.searchParams.get("workspace") || list[0]?.id;
      if (!selected)
        return corsResponse({ authAvailable: true, mode: "preview", actor, workspace: previewState, memberships: [], terminal3: { connected: false, detail: "Not connected" }, signInPath: "#signin" });
      const s = await scoped(repo, actor, selected);
      return corsResponse({ ...view(s.state, s.members, s.actor), availableWorkspaces: list });
    }

    if (request.method === "GET" && path === "sample") {
      const id = url.searchParams.get("document") || "";
      const e = previewState.engagements.find((e: any) => e.documents.some((d: any) => d.id === id));
      if (!e || !fixtureBytes[id as string]) throw { code: "NOT_FOUND", message: "Sample unavailable.", status: 404 };
      const b = Uint8Array.from(atob(fixtureBytes[id as string] as string), (c) => c.charCodeAt(0));
      return new Response(b, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=Mandate_Synthetic_Sample.pdf", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff", ...corsHeaders } });
    }

    if (request.method === "POST" && path === "create") {
      actorOf(actor);
      await body(request);
      const existing = await repo.forUser(actor.id);
      for (const w of existing) {
        const s = await repo.state(w.id);
        if (s.ownerId === actor.id) throw { code: "WORKSPACE_EXISTS", message: "Your sandbox already exists. Refresh to open it.", status: 409 };
      }
      const state = seedWorkspace(crypto.randomUUID(), actor.id, now());
      for (const e of state.engagements)
        for (const d of e.documents) {
          const bytes = Uint8Array.from(atob(fixtureBytes[d.id] as string), (c) => c.charCodeAt(0));
          const hash = await digest(bytes);
          d.sha256 = hash;
          if (e.source && d.id === e.source.documentId) e.source.sha256 = hash;
          d.key = `${state.id}/${d.id}`;
          await files.put(d.key, bytes);
        }
      await repo.create(state);
      const members = await repo.members(state.id);
      return corsResponse(view(state, members, actor), 201);
    }

    if (request.method === "GET" && path === "document") {
      const s = await scoped(repo, actor, url.searchParams.get("workspace") || "", url.searchParams.get("engagement") || "invalid");
      const e = engagement(s.state, url.searchParams.get("engagement")!);
      const d = documentFor(e, url.searchParams.get("document") || "");
      const bytes = await files.get(d.key);
      if (!bytes) throw { code: "FILE_UNAVAILABLE", message: "The document is temporarily unavailable.", status: 503 };
      if ((await digest(bytes)) !== d.sha256)
        throw { code: "DOCUMENT_INTEGRITY", message: "Document integrity check failed.", status: 409 };
      return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=Mandate_Synthetic_Document.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...corsHeaders } });
    }

    if (request.method === "POST" && path === "command") {
      const b = commandSchema.parse(await body(request));
      const s = await scoped(repo, actor, b.workspaceId, b.engagementId);
      if (b.revision !== s.state.revision)
        throw { code: "STALE_VERSION", message: "The workspace changed. Refresh before continuing.", status: 409 };
      const e = engagement(s.state, b.engagementId);
      if (["review_source", "approve", "release"].includes(b.action)) {
        for (const id of [e.source?.documentId, e.request?.documentId].filter(Boolean) as string[]) {
          const d = documentFor(e, id);
          const bytes = await files.get(d.key);
          if (!bytes || (await digest(bytes)) !== d.sha256)
            throw { code: "DOCUMENT_INTEGRITY", message: "Document integrity check failed. Nothing was released.", status: 409 };
        }
      }
      const result = await applyCommand(s.state, s.actor, s.members, b.engagementId, b, now());
      if (!result.replayed) await repo.save(result.state, s.state.revision, b.engagementId, b.action);
      return corsResponse({ ...view(result.state, s.members, s.actor), blocked: result.blocked, replayed: result.replayed }, result.blocked?.status || 200);
    }

    if (request.method === "POST" && path === "invite") {
      const b = z.object({ workspaceId: z.string().uuid(), engagementId: z.string().max(80), email: z.string().email().max(254) }).strict().parse(await body(request));
      const s = await scoped(repo, actor, b.workspaceId, b.engagementId);
      membership(s.members, s.actor, b.engagementId, ["preparer"]);
      if (b.email.toLowerCase() === s.actor.email.toLowerCase())
        throw { code: "SELF_INVITE", message: "Invite a different reviewer.", status: 400 };
      const count = await repo.countInvitations(b.workspaceId);
      if (count >= 10) throw { code: "INVITE_LIMIT", message: "This sandbox has reached its invitation limit.", status: 429 };
      const token = crypto.randomUUID() + crypto.randomUUID();
      await repo.createInvitation(await digest(token), b.workspaceId, s.actor.id, b.email, b.engagementId, now() + 86400000);
      return corsResponse({ invitePath: `/?invite=${token}`, expiresInHours: 24 }, 201);
    }

    if (request.method === "POST" && path === "join") {
      const b = z.object({ token: z.string().min(60).max(100) }).strict().parse(await body(request));
      actorOf(actor);
      const row = await repo.getInvitation(await digest(b.token));
      if (!row || row.claimed_by || row.expires_at <= now() || row.email !== actor.email.toLowerCase() || row.inviter_id === actor.id)
        throw { code: "INVITE_INVALID", message: "This invitation is expired, used or intended for another reviewer.", status: 403 };
      const claimed = await repo.claimInvitation(await digest(b.token));
      if (!claimed) throw { code: "INVITE_INVALID", message: "This invitation is expired, used or intended for another reviewer.", status: 403 };
      const s = await scoped(repo, actor, row.workspace_id);
      return corsResponse(view(s.state, s.members, s.actor));
    }

    if (request.method === "GET" && path === "evidence") {
      const s = await scoped(repo, actor, url.searchParams.get("workspace") || "");
      const v = view(s.state, s.members, s.actor);
      return new Response(JSON.stringify({ exportedAt: now(), disclosure: "Synthetic data. Internal sandbox receipts only; no Terminal 3 proof or external delivery.", ...v }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=Mandate_Evidence.json", "Cache-Control": "no-store", ...corsHeaders } });
    }

    return corsResponse({ error: "Not found" }, 404);
  } catch (err: any) {
    if (err instanceof z.ZodError) return corsResponse({ error: "Please check the request fields.", code: "INVALID_INPUT" }, 400);
    if (err.code && err.status) return corsResponse({ error: err.message, code: err.code }, err.status);
    console.error("mandate-api error:", err);
    return corsResponse({ error: "The workspace is temporarily unavailable. Your changes were not confirmed; refresh before retrying.", code: "UNAVAILABLE" }, 503);
  }
});
