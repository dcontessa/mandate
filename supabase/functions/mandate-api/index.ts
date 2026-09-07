// @ts-nocheck — Deno runtime edge function, excluded from tsc
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.25.76";
import fixtureBytes from "./fixture-bytes.json" with { type: "json" };

import {
  POLICY_VERSION,
  SANDBOX_AGENT,
  digest,
  membership,
  engagement,
  documentFor,
  sourceChecks,
  snapshot,
  releaseChecks,
  event,
  applyCommand,
} from "./domain.ts";
import { seedWorkspace, previewState } from "./seed.ts";
import type { Actor, WorkspaceState, Member } from "./types.ts";

const EDGE_BUILD = "mandate-api-v12";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function corsResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getActor(request: Request): Promise<Actor | null> {
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
  if (!user.email_confirmed_at) return null;

  return {
    id: user.id as string,
    email: user.email as string,
    name: (user.user_metadata?.name as string) || user.email,
  };
}

class Repository {
  private client: ReturnType<typeof createClient>;
  private actorId: string;
  private actorEmail: string;

  constructor(client: ReturnType<typeof createClient>, actorId: string, actorEmail = "") {
    this.client = client;
    this.actorId = actorId;
    this.actorEmail = actorEmail;
  }

  async state(id: string): Promise<WorkspaceState> {
    const { data, error } = await this.client.rpc("mandate_get_workspace_state", { p_actor_id: this.actorId, p_workspace_id: id });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    if (!data) throw { code: "NOT_FOUND", message: "Workspace unavailable.", status: 404 };
    return data as WorkspaceState;
  }

  async members(id: string): Promise<Member[]> {
    const { data, error } = await this.client.rpc("mandate_get_workspace_members", { p_actor_id: this.actorId, p_workspace_id: id });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    return ((data || []) as any[]).map((r) => ({ userId: r.user_id, engagementId: r.engagement_id, role: r.role }));
  }

  async forUser(): Promise<{ id: string }[]> {
    const { data, error } = await this.client.rpc("mandate_get_user_workspaces", { p_actor_id: this.actorId });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    return ((data || []) as any[]).slice(0, 20).map((r) => ({ id: r.id }));
  }

  async create(state: WorkspaceState): Promise<void> {
    const { error } = await this.client.rpc("mandate_create_workspace", { p_actor_id: this.actorId, p_state: state });
    if (error) {
      if (error.code === "40901") throw { code: "WORKSPACE_EXISTS", message: "Your sandbox already exists. Refresh to open it.", status: 409 };
      throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    }
  }

  async save(state: WorkspaceState, expected: number, engagementId: string, action: string): Promise<void> {
    state.revision = expected + 1;
    const { error } = await this.client.rpc("mandate_save_workspace_state", {
      p_actor_id: this.actorId, p_state: state, p_expected_revision: expected, p_engagement_id: engagementId, p_action: action,
    });
    if (error) {
      if (error.code === "40001") throw { code: "STALE_VERSION", message: "The workspace changed. Refresh before continuing.", status: 409 };
      throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    }
  }

  async countInvitations(ws: string): Promise<number> {
    const { data, error } = await this.client.rpc("mandate_count_invitations", { p_actor_id: this.actorId, p_workspace_id: ws });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    return Number(data || 0);
  }

  async createInvitation(tokenHash: string, ws: string, _inviter: string, email: string, eng: string, exp: number): Promise<void> {
    const { error } = await this.client.rpc("mandate_create_invitation", {
      p_actor_id: this.actorId, p_token_hash: tokenHash, p_workspace_id: ws, p_email: email.toLowerCase(), p_engagement_id: eng, p_expires_at: exp,
    });
    if (error) throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
  }

  async claimInvitation(tokenHash: string): Promise<{ workspace_id: string; engagement_id: string } | null> {
    const { data, error } = await this.client.rpc("mandate_claim_invitation", {
      p_token_hash: tokenHash, p_actor_id: this.actorId, p_actor_email: this.actorEmail,
    });
    if (error) {
      if (error.code === "40301" || error.code === "40302") return null;
      throw { code: "UNAVAILABLE", message: "Database error.", status: 503 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { workspace_id: row.workspace_id, engagement_id: row.engagement_id } : null;
  }
}

function createFileStore(client: ReturnType<typeof createClient>) {
  return {
    get: async (key: string): Promise<Uint8Array | null> => {
      const { data, error } = await client.storage.from("mandate-docs").download(key);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    put: async (key: string, bytes: Uint8Array): Promise<void> => {
      const { error } = await client.storage.from("mandate-docs").upload(key, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
    },
  };
}

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

function actorOf(actor: Actor | null): Actor {
  if (!actor) throw { code: "SIGN_IN_REQUIRED", message: "Sign in to access your workspace.", status: 401 };
  return actor;
}

async function scoped(repo: Repository, actor: Actor, id: string, eid?: string) {
  const members = await repo.members(id);
  if (eid) membership(members, actor, eid);
  else if (!members.some((m) => m.userId === actor.id))
    throw { code: "FORBIDDEN", message: "Workspace unavailable.", status: 403 };
  const state = await repo.state(id);
  return { actor, members, state };
}

function view(state: WorkspaceState, members: Member[], actor: Actor) {
  const allowed = new Set(members.filter((m) => m.userId === actor.id).map((m) => m.engagementId));
  const engagements = state.engagements.filter((e) => allowed.has(e.id));
  const companies = new Set(engagements.map((e) => e.companyId));
  return {
    authAvailable: true, mode: "workspace", actor,
    workspace: {
      ...state,
      engagements,
      companies: state.companies.filter((c) => companies.has(c.id)),
      events: state.events.filter((e) => allowed.has(e.engagementId)),
    },
    memberships: members.filter((m) => allowed.has(m.engagementId)),
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

async function handleRequest(request: Request, actor: Actor | null, repo: Repository, files: any, now: () => number, origin: string | null, serviceClient: any) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/mandate-api\/?/, "");

  if (request.method !== "GET") {
    if (request.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405, origin);
    actorOf(actor);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      throw { code: "CONTENT_TYPE", message: "Use JSON requests.", status: 415 };
  }

  // GET / — preview or workspace view
  if (request.method === "GET" && path === "") {
    if (!actor)
      return corsResponse({ authAvailable: true, mode: "preview", actor: null, workspace: previewState, memberships: [], terminal3: { connected: false, detail: "Not connected" }, signInPath: "#signin" }, 200, origin);
    const list = await repo.forUser();
    const selected = url.searchParams.get("workspace") || list[0]?.id;
    if (!selected)
      return corsResponse({ authAvailable: true, mode: "preview", actor, workspace: previewState, memberships: [], terminal3: { connected: false, detail: "Not connected" }, signInPath: "#signin" }, 200, origin);
    const s = await scoped(repo, actor, selected);
    return corsResponse({ ...view(s.state, s.members, s.actor), availableWorkspaces: list }, 200, origin);
  }

  // GET /sample — anonymous synthetic PDF
  if (request.method === "GET" && path === "sample") {
    const id = url.searchParams.get("document") || "";
    const e = previewState.engagements.find((e: any) => e.documents.some((d: any) => d.id === id));
    if (!e || !fixtureBytes[id]) throw { code: "NOT_FOUND", message: "Sample unavailable.", status: 404 };
    const b = Uint8Array.from(atob(fixtureBytes[id]), (c: string) => c.charCodeAt(0));
    return new Response(b, { headers: { ...corsHeaders(origin), "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=Mandate_Synthetic_Sample.pdf", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  }

  // POST /create — create sandbox
  if (request.method === "POST" && path === "create") {
    actorOf(actor);
    await body(request);
    const existing = await repo.forUser();
    for (const w of existing) {
      const s = await repo.state(w.id);
      if (s.ownerId === actor.id) throw { code: "WORKSPACE_EXISTS", message: "Your sandbox already exists. Refresh to open it.", status: 409 };
    }
    const state = seedWorkspace(crypto.randomUUID(), actor.id, now());
    for (const e of state.engagements)
      for (const d of e.documents) {
        const bytes = Uint8Array.from(atob(fixtureBytes[d.id]), (c: string) => c.charCodeAt(0));
        if ((await digest(bytes)) !== d.sha256)
          throw { code: "FIXTURE_INTEGRITY", message: "Sample integrity check failed.", status: 503 };
        await files.put(d.key, bytes);
      }
    await repo.create(state);
    const members = await repo.members(state.id);
    return corsResponse(view(state, members, actor), 201, origin);
  }

  // GET /document — authenticated document download
  if (request.method === "GET" && path === "document") {
    const s = await scoped(repo, actor, url.searchParams.get("workspace") || "", url.searchParams.get("engagement") || "invalid");
    const e = engagement(s.state, url.searchParams.get("engagement")!);
    const d = documentFor(e, url.searchParams.get("document") || "");
    const bytes = await files.get(d.key);
    if (!bytes) throw { code: "FILE_UNAVAILABLE", message: "The document is temporarily unavailable.", status: 503 };
    if ((await digest(bytes)) !== d.sha256)
      throw { code: "DOCUMENT_INTEGRITY", message: "Document integrity check failed.", status: 409 };
    return new Response(new Uint8Array(bytes).buffer, { headers: { ...corsHeaders(origin), "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=Mandate_Synthetic_Document.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }

  // POST /command — domain command
  if (request.method === "POST" && path === "command") {
    const b = commandSchema.parse(await body(request)) as any;
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
    return corsResponse({ ...view(result.state, s.members, s.actor), blocked: result.blocked, replayed: result.replayed }, result.blocked?.status || 200, origin);
  }

  // POST /invite — create invitation
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
    return corsResponse({ invitePath: `/?invite=${token}`, expiresInHours: 24 }, 201, origin);
  }

  // POST /join — claim invitation
  if (request.method === "POST" && path === "join") {
    const b = z.object({ token: z.string().min(60).max(100) }).strict().parse(await body(request));
    actorOf(actor);
    const claimed = await repo.claimInvitation(await digest(b.token));
    if (!claimed) throw { code: "INVITE_INVALID", message: "This invitation is expired, used or intended for another reviewer.", status: 403 };
    const s = await scoped(repo, actor, claimed.workspace_id);
    return corsResponse(view(s.state, s.members, s.actor), 200, origin);
  }

  // GET /evidence — export evidence
  if (request.method === "GET" && path === "evidence") {
    const s = await scoped(repo, actor, url.searchParams.get("workspace") || "");
    const v = view(s.state, s.members, s.actor);
    return new Response(JSON.stringify({ exportedAt: now(), disclosure: "Synthetic data. Internal sandbox receipts only; no Terminal 3 proof or external delivery.", ...v }, null, 2), {
      headers: { ...corsHeaders(origin), "Content-Type": "application/json", "Content-Disposition": "attachment; filename=Mandate_Evidence.json", "Cache-Control": "no-store" },
    });
  }

  return corsResponse({ error: "Not found" }, 404, origin);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders(origin) });

  try {
    const actor = await getActor(request);
    const serviceClient = createServiceClient();
    const repo = new Repository(serviceClient, actor?.id ?? "", actor?.email ?? "");
    const files = createFileStore(serviceClient);
    const now = () => Date.now();
    return await handleRequest(request, actor, repo, files, now, origin, serviceClient);
  } catch (err: any) {
    if (err instanceof z.ZodError) return corsResponse({ error: "Please check the request fields.", code: "INVALID_INPUT" }, 400, origin);
    if (err.code && err.status) return corsResponse({ error: err.message, code: err.code }, err.status, origin);
    console.error("mandate-api error:", err);
    return corsResponse({ error: "The workspace is temporarily unavailable. Your changes were not confirmed; refresh before retrying.", code: "UNAVAILABLE" }, 503, origin);
  }
});
