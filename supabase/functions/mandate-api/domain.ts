import type {
  Actor,
  Member,
  WorkspaceState,
  Engagement,
  Approval,
  Activity,
  DocumentRecord,
} from "./types.ts";
import { DomainError } from "./types.ts";
export const POLICY_VERSION = "mandate-sandbox-1";
export const SANDBOX_AGENT = "internal-sandbox-worker"; // Not a Terminal 3 DID.
export async function digest(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function membership(
  members: Member[],
  actor: Actor,
  engagementId: string,
  roles?: string[],
) {
  const m = members.find(
    (m) => m.userId === actor.id && m.engagementId === engagementId,
  );
  if (!m || (roles && !roles.includes(m.role)))
    throw new DomainError(
      "FORBIDDEN",
      "You do not have permission for this engagement.",
      403,
    );
  return m;
}
export function engagement(state: WorkspaceState, id: string) {
  const e = state.engagements.find((x) => x.id === id);
  if (!e) throw new DomainError("NOT_FOUND", "Engagement unavailable.", 404);
  return e;
}
export function documentFor(e: Engagement, id: string): DocumentRecord {
  const d = e.documents.find((d) => d.id === id);
  if (!d)
    throw new DomainError(
      "DOCUMENT_UNAVAILABLE",
      "Document unavailable for this engagement.",
      404,
    );
  return d;
}
function exactSet(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    [...a].sort().join("|") === [...b].sort().join("|")
  );
}
export function sourceChecks(e: Engagement, now: number, members: Member[]) {
  const s = e.source,
    r = e.request;
  if (!s || !r)
    throw new DomainError(
      "NO_WORKFLOW",
      "This engagement has no release workflow.",
    );
  if (
    !s.reviewedBy ||
    !members.some(
      (m) =>
        m.userId === s.reviewedBy &&
        m.engagementId === e.id &&
        m.role === "reviewer",
    )
  )
    throw new DomainError(
      "SOURCE_NOT_REVIEWED",
      "An authorised reviewer must establish the source authority.",
    );
  if (s.reviewedBy === r.createdBy)
    throw new DomainError(
      "SOURCE_SELF_REVIEW",
      "The preparer cannot review their own source authority.",
    );
  if (s.expiresAt <= now)
    throw new DomainError(
      "SOURCE_EXPIRED",
      "The source authority has expired. A fresh review is required.",
    );
  const sourceDoc = documentFor(e, s.documentId),
    doc = documentFor(e, r.documentId);
  if (s.sha256 !== sourceDoc.sha256)
    throw new DomainError("SOURCE_CHANGED", "The source document has changed.");
  if (
    doc.kind !== "release_package" ||
    !exactSet(s.signatories, doc.signatories)
  )
    throw new DomainError(
      "SIGNATORIES_NOT_AUTHORISED",
      "Only Person A and Person B jointly are authorised. This package does not match.",
    );
  if (r.policyVersion !== POLICY_VERSION)
    throw new DomainError(
      "POLICY_CHANGED",
      "The release policy changed. Request a fresh review.",
    );
  return { source: s, request: r, doc };
}
export async function snapshot(
  state: WorkspaceState,
  e: Engagement,
  expiresAt: number,
) {
  const r = e.request!,
    s = e.source!,
    d = documentFor(e, r.documentId);
  return digest(
    JSON.stringify({
      tenant: state.id,
      company: e.companyId,
      engagement: e.id,
      source: s.id,
      sourceHash: s.sha256,
      sourceRevision: s.revision,
      sourceExpiry: s.expiresAt,
      sourceReviewer: s.reviewedBy,
      document: d.id,
      version: d.version,
      hash: d.sha256,
      signatories: [...d.signatories].sort(),
      action: "release",
      mode: r.mode,
      destination: r.destination,
      agent: r.agentIdentity,
      policy: r.policyVersion,
      approvalExpiresAt: expiresAt,
      requestId: r.id,
    }),
  );
}
export async function releaseChecks(
  state: WorkspaceState,
  e: Engagement,
  members: Member[],
  now: number,
) {
  const checked = sourceChecks(e, now, members),
    a = checked.request.approval;
  if (!a)
    throw new DomainError(
      "APPROVAL_REQUIRED",
      "An independent reviewer must approve this exact package and recipient.",
    );
  if (
    a.reviewerId === checked.request.createdBy ||
    !members.some(
      (m) =>
        m.userId === a.reviewerId &&
        m.engagementId === e.id &&
        m.role === "reviewer",
    )
  )
    throw new DomainError(
      "APPROVAL_INVALID",
      "The approval requires a current independent reviewer.",
    );
  if (a.expiresAt <= now)
    throw new DomainError(
      "APPROVAL_EXPIRED",
      "This approval has expired. Request a fresh review.",
    );
  if ((await snapshot(state, e, a.expiresAt)) !== a.snapshot)
    throw new DomainError(
      "SNAPSHOT_CHANGED",
      "The document, authority, agent or recipient changed after approval. Review again.",
    );
  if (checked.request.mode === "terminal3")
    throw new DomainError(
      "TERMINAL3_NOT_CONNECTED",
      "Terminal 3 execution is not connected. No document was released.",
      503,
    );
  if (checked.request.agentIdentity !== SANDBOX_AGENT)
    throw new DomainError(
      "AGENT_MISMATCH",
      "This approval is not bound to the internal sandbox worker.",
    );
  return { ...checked, approval: a };
}
export function event(
  state: WorkspaceState,
  actor: Actor,
  e: Engagement,
  action: string,
  outcome: string,
  details: string,
  now: number,
) {
  if (state.events.length >= 1000)
    throw new DomainError(
      "SANDBOX_EVENT_LIMIT",
      "This sandbox has reached its event limit.",
      429,
    );
  const entry: Activity = {
    id: crypto.randomUUID(),
    at: now,
    actorId: actor.id,
    engagementId: e.id,
    action,
    outcome,
    details,
  };
  state.events.push(entry);
}
export type Command = {
  action:
    | "review_source"
    | "approve"
    | "change_package"
    | "change_recipient"
    | "set_mode"
    | "release";
  documentId?: string;
  destination?: "sandbox_primary" | "sandbox_alternate";
  mode?: "sandbox" | "terminal3";
  acknowledgement?: boolean;
};
export async function applyCommand(
  original: WorkspaceState,
  actor: Actor,
  members: Member[],
  engagementId: string,
  command: Command,
  now: number,
) {
  const state = structuredClone(original);
  membership(members, actor, engagementId);
  const e = engagement(state, engagementId),
    r = e.request;
  if (!r || !e.source)
    throw new DomainError(
      "NO_WORKFLOW",
      "This service currently contains reference documents only.",
    );
  const a = command.action;
  if (a === "review_source" || a === "approve") {
    membership(members, actor, e.id, ["reviewer"]);
    if (actor.id === r.createdBy)
      throw new DomainError(
        "SELF_APPROVAL",
        "The preparer cannot approve their own work.",
        403,
      );
    if (!command.acknowledgement)
      throw new DomainError(
        "ACKNOWLEDGEMENT_REQUIRED",
        "Confirm that you reviewed the exact documents and scope.",
        400,
      );
  } else membership(members, actor, e.id, ["preparer"]);
  if (r.status === "recorded" && a !== "release")
    throw new DomainError(
      "REQUEST_COMPLETED",
      "This request already has a sandbox receipt; its approved snapshot is frozen.",
    );
  if (a === "review_source") {
    e.source.reviewedBy = actor.id;
    e.source.reviewedAt = now;
    e.source.expiresAt = now + 3600000;
    e.source.revision++;
    if (r.approval) r.status = "needs_review";
    event(
      state,
      actor,
      e,
      a,
      "reviewed",
      "Established synthetic source: Person A + Person B jointly. Valid for one hour.",
      now,
    );
  } else if (a === "approve") {
    sourceChecks(e, now, members);
    const expiresAt = Math.min(now + 1800000, e.source.expiresAt);
    const approval: Approval = {
      id: crypto.randomUUID(),
      reviewerId: actor.id,
      createdAt: now,
      expiresAt,
      snapshot: await snapshot(state, e, expiresAt),
    };
    r.approval = approval;
    r.status = "approved";
    event(
      state,
      actor,
      e,
      a,
      "approved",
      `Approved ${r.documentId}, ${r.destination}, ${r.mode}; bound to exact SHA-256 snapshot.`,
      now,
    );
  } else if (a === "change_package") {
    const d = documentFor(e, command.documentId || "");
    if (d.kind !== "release_package")
      throw new DomainError(
        "INVALID_PACKAGE",
        "Choose a release package.",
        400,
      );
    r.documentId = d.id;
    r.status = r.approval ? "needs_review" : "awaiting_review";
    event(
      state,
      actor,
      e,
      a,
      "changed",
      `Selected package v${d.version}. An earlier approval must match the new snapshot.`,
      now,
    );
  } else if (a === "change_recipient") {
    if (
      !["sandbox_primary", "sandbox_alternate"].includes(
        command.destination || "",
      )
    )
      throw new DomainError(
        "INVALID_DESTINATION",
        "Choose a configured sandbox destination.",
        400,
      );
    r.destination = command.destination!;
    r.status = r.approval ? "needs_review" : "awaiting_review";
    event(
      state,
      actor,
      e,
      a,
      "changed",
      `Destination changed to ${r.destination}.`,
      now,
    );
  } else if (a === "set_mode") {
    if (!["sandbox", "terminal3"].includes(command.mode || ""))
      throw new DomainError(
        "INVALID_MODE",
        "Choose an available execution mode.",
        400,
      );
    r.mode = command.mode!;
    r.agentIdentity = r.mode === "sandbox" ? SANDBOX_AGENT : null;
    r.status = r.approval ? "needs_review" : "awaiting_review";
    event(
      state,
      actor,
      e,
      a,
      "changed",
      `Execution mode changed to ${r.mode}.`,
      now,
    );
  } else if (a === "release") {
    if (r.receipt) return { state: original, replayed: true, blocked: null };
    try {
      const checked = await releaseChecks(state, e, members, now);
      r.receipt = {
        id: crypto.randomUUID(),
        requestId: r.id,
        snapshot: checked.approval.snapshot,
        documentHash: checked.doc.sha256,
        destination: r.destination,
        recordedAt: now,
        kind: "internal_sandbox",
        terminal3Proof: null,
      };
      r.status = "recorded";
      event(
        state,
        actor,
        e,
        a,
        "recorded",
        "Internal sandbox receipt recorded. No external delivery or Terminal 3 call occurred.",
        now,
      );
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      event(state, actor, e, a, "blocked", `${err.code}: ${err.message}`, now);
      return {
        state,
        replayed: false,
        blocked: { code: err.code, message: err.message, status: err.status },
      };
    }
  } else throw new DomainError("INVALID_ACTION", "Unsupported action.", 400);
  return { state, replayed: false, blocked: null };
}
