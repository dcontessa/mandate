import { z } from "zod";
import { Repository } from "./repository.ts";
import {
  applyCommand,
  digest,
  membership,
  engagement,
  documentFor,
} from "./domain.ts";
import { seedWorkspace, previewState } from "./seed.ts";
import { DomainError } from "./types.ts";
import type { Actor, WorkspaceState, Member } from "./types.ts";
export interface FileStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
}
export type Context = {
  authAvailable?: boolean;
  actor: Actor | null;
  repo: Repository;
  files: FileStore;
  fixtureBytes: Record<string, string>;
  now: () => number;
};
const commandSchema = z
  .object({
    workspaceId: z.string().uuid(),
    engagementId: z.string().max(80),
    revision: z.number().int().nonnegative(),
    action: z.enum([
      "review_source",
      "approve",
      "change_package",
      "change_recipient",
      "set_mode",
      "release",
    ]),
    documentId: z.string().max(80).optional(),
    destination: z.enum(["sandbox_primary", "sandbox_alternate"]).optional(),
    mode: z.enum(["sandbox", "terminal3"]).optional(),
    acknowledgement: z.boolean().optional(),
  })
  .strict();
function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function actorOf(ctx: Context) {
  if (!ctx.actor)
    throw new DomainError(
      "SIGN_IN_REQUIRED",
      "Sign in to access your workspace.",
      401,
    );
  return ctx.actor;
}
async function scoped(ctx: Context, id: string, eid?: string) {
  const actor = actorOf(ctx),
    members = await ctx.repo.members(id);
  if (eid) membership(members, actor, eid);
  else if (!members.some((m) => m.userId === actor.id))
    throw new DomainError("FORBIDDEN", "Workspace unavailable.", 403);
  const state = await ctx.repo.state(id);
  return { actor, members, state };
}
function view(state: WorkspaceState, members: Member[], actor: Actor) {
  const allowed = new Set(
    members.filter((m) => m.userId === actor.id).map((m) => m.engagementId),
  );
  const engagements = state.engagements.filter((e) => allowed.has(e.id));
  const companies = new Set(engagements.map((e) => e.companyId));
  return {
    authAvailable: true,
    mode: "workspace",
    actor,
    workspace: {
      ...state,
      engagements,
      companies: state.companies.filter((c) => companies.has(c.id)),
      events: state.events.filter((e) => allowed.has(e.engagementId)),
    },
    memberships: members.filter((m) => allowed.has(m.engagementId)),
    terminal3: {
      connected: false,
      detail: "Live Terminal 3 execution has not been connected.",
    },
    signInPath: "#signin",
  };
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader)
    throw new DomainError("INVALID_INPUT", "A request body is required.", 400);
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 8192) {
      await reader.cancel();
      throw new DomainError("BODY_TOO_LARGE", "Request is too large.", 413);
    }
    parts.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    joined.set(p, offset);
    offset += p.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(joined));
  } catch {
    throw new DomainError("INVALID_JSON", "Invalid request body.", 400);
  }
}
export async function handleApi(request: Request, ctx: Context) {
  const url = new URL(request.url),
    path = url.pathname.replace(/^\/api\/mandate\/?/, "");
  try {
    if (request.method !== "GET") {
      if (request.method !== "POST")
        return response({ error: "Method not allowed" }, 405);
      actorOf(ctx);
      if (request.headers.get("Origin") !== url.origin)
        throw new DomainError(
          "ORIGIN_REJECTED",
          "Request origin rejected.",
          403,
        );
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        throw new DomainError("CONTENT_TYPE", "Use JSON requests.", 415);
    }
    if (request.method === "GET" && path === "") {
      if (!ctx.actor)
        return response({
          authAvailable: !!ctx.authAvailable,
          mode: "preview",
          actor: null,
          workspace: previewState,
          memberships: [],
          terminal3: { connected: false, detail: "Not connected" },
          signInPath: "#signin",
        });
      const list = await ctx.repo.forUser(ctx.actor.id),
        selected = url.searchParams.get("workspace") || list[0]?.id;
      if (!selected)
        return response({
          authAvailable: !!ctx.authAvailable,
          mode: "preview",
          actor: ctx.actor,
          workspace: previewState,
          memberships: [],
          terminal3: { connected: false, detail: "Not connected" },
          signInPath: "#signin",
        });
      const s = await scoped(ctx, selected);
      return response({
        ...view(s.state, s.members, s.actor),
        availableWorkspaces: list,
      });
    }
    if (request.method === "GET" && path === "sample") {
      const id = url.searchParams.get("document") || "";
      const e = previewState.engagements.find((e) =>
        e.documents.some((d) => d.id === id),
      );
      if (!e || !ctx.fixtureBytes[id])
        throw new DomainError("NOT_FOUND", "Sample unavailable.", 404);
      const b = Uint8Array.from(atob(ctx.fixtureBytes[id]), (c) =>
        c.charCodeAt(0),
      );
      return new Response(b, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            "inline; filename=Mandate_Synthetic_Sample.pdf",
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method === "POST" && path === "create") {
      const actor = actorOf(ctx);
      await body(request);
      const existing = await ctx.repo.forUser(actor.id);
      for (const w of existing) {
        const s = await ctx.repo.state(w.id);
        if (s.ownerId === actor.id)
          throw new DomainError(
            "WORKSPACE_EXISTS",
            "Your sandbox already exists. Refresh to open it.",
          );
      }
      const state = seedWorkspace(crypto.randomUUID(), actor.id, ctx.now());
      for (const e of state.engagements)
        for (const d of e.documents) {
          const bytes = Uint8Array.from(atob(ctx.fixtureBytes[d.id]), (c) =>
            c.charCodeAt(0),
          );
          if ((await digest(bytes)) !== d.sha256)
            throw new DomainError(
              "FIXTURE_INTEGRITY",
              "Sample integrity check failed.",
              503,
            );
          await ctx.files.put(d.key, bytes);
        }
      await ctx.repo.create(state);
      return response(
        view(state, await ctx.repo.members(state.id), actor),
        201,
      );
    }
    if (request.method === "GET" && path === "document") {
      const s = await scoped(
        ctx,
        url.searchParams.get("workspace") || "",
        url.searchParams.get("engagement") || "invalid",
      );
      const e = engagement(s.state, url.searchParams.get("engagement")!),
        d = documentFor(e, url.searchParams.get("document") || "");
      const bytes = await ctx.files.get(d.key);
      if (!bytes)
        throw new DomainError(
          "FILE_UNAVAILABLE",
          "The document is temporarily unavailable.",
          503,
        );
      if ((await digest(bytes)) !== d.sha256)
        throw new DomainError(
          "DOCUMENT_INTEGRITY",
          "Document integrity check failed.",
          409,
        );
      return new Response(new Uint8Array(bytes).buffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition":
            "inline; filename=Mandate_Synthetic_Document.pdf",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method === "POST" && path === "command") {
      const b = commandSchema.parse(await body(request));
      const s = await scoped(ctx, b.workspaceId, b.engagementId);
      if (b.revision !== s.state.revision)
        throw new DomainError(
          "STALE_VERSION",
          "The workspace changed. Refresh before continuing.",
        );
      const e = engagement(s.state, b.engagementId);
      if (["review_source", "approve", "release"].includes(b.action)) {
        for (const id of [e.source?.documentId, e.request?.documentId].filter(
          Boolean,
        ) as string[]) {
          const d = documentFor(e, id),
            bytes = await ctx.files.get(d.key);
          if (!bytes || (await digest(bytes)) !== d.sha256)
            throw new DomainError(
              "DOCUMENT_INTEGRITY",
              "Document integrity check failed. Nothing was released.",
            );
        }
      }
      const result = await applyCommand(
        s.state,
        s.actor,
        s.members,
        b.engagementId,
        b,
        ctx.now(),
      );
      if (!result.replayed) await ctx.repo.save(result.state, s.state.revision);
      return response(
        {
          ...view(result.state, s.members, s.actor),
          blocked: result.blocked,
          replayed: result.replayed,
        },
        result.blocked?.status || 200,
      );
    }
    if (request.method === "POST" && path === "invite") {
      const b = z
        .object({
          workspaceId: z.string().uuid(),
          engagementId: z.string().max(80),
          email: z.string().email().max(254),
        })
        .strict()
        .parse(await body(request));
      const s = await scoped(ctx, b.workspaceId, b.engagementId);
      membership(s.members, s.actor, b.engagementId, ["preparer"]);
      if (b.email.toLowerCase() === s.actor.email.toLowerCase())
        throw new DomainError(
          "SELF_INVITE",
          "Invite a different reviewer.",
          400,
        );
      const count = await ctx.repo.countInvitations(b.workspaceId);
      if (count >= 10)
        throw new DomainError(
          "INVITE_LIMIT",
          "This sandbox has reached its invitation limit.",
          429,
        );
      const token = crypto.randomUUID() + crypto.randomUUID();
      await ctx.repo.createInvitation(
        await digest(token),
        b.workspaceId,
        s.actor.id,
        b.email,
        b.engagementId,
        ctx.now() + 86400000,
      );
      return response(
        { invitePath: `/?invite=${token}`, expiresInHours: 24 },
        201,
      );
    }
    if (request.method === "POST" && path === "join") {
      const b = z
          .object({ token: z.string().min(60).max(100) })
          .strict()
          .parse(await body(request)),
        actor = actorOf(ctx);
      const row = await ctx.repo.getInvitation(await digest(b.token));
      if (
        !row ||
        row.claimed_by ||
        row.expires_at <= ctx.now() ||
        row.email !== actor.email.toLowerCase() ||
        row.inviter_id === actor.id
      )
        throw new DomainError(
          "INVITE_INVALID",
          "This invitation is expired, used or intended for another reviewer.",
          403,
        );
      const claimed = await ctx.repo.claimInvitation(
        await digest(b.token),
        actor.id,
        ctx.now(),
      );
      if (!claimed)
        throw new DomainError(
          "INVITE_INVALID",
          "This invitation is expired, used or intended for another reviewer.",
          403,
        );
      const s = await scoped(ctx, row.workspace_id);
      return response(view(s.state, s.members, s.actor));
    }
    if (request.method === "GET" && path === "evidence") {
      const s = await scoped(ctx, url.searchParams.get("workspace") || "");
      const v = view(s.state, s.members, s.actor);
      return new Response(
        JSON.stringify(
          {
            exportedAt: ctx.now(),
            disclosure:
              "Synthetic data. Internal sandbox receipts only; no Terminal 3 proof or external delivery.",
            ...v,
          },
          null,
          2,
        ),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": "attachment; filename=Mandate_Evidence.json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return response({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof z.ZodError)
      return response(
        { error: "Please check the request fields.", code: "INVALID_INPUT" },
        400,
      );
    if (err instanceof DomainError)
      return response({ error: err.message, code: err.code }, err.status);
    console.error(
      JSON.stringify({
        event: "mandate_api_error",
        path,
        error: err instanceof Error ? err.name : "UnknownError",
      }),
    );
    return response(
      {
        error:
          "The workspace is temporarily unavailable. Your changes were not confirmed; refresh before retrying.",
        code: "UNAVAILABLE",
      },
      503,
    );
  }
}
