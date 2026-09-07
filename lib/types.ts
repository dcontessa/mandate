export type Role =
  | "preparer"
  | "reviewer"
  | "client_representative"
  | "release_agent";
export type Member = { userId: string; engagementId: string; role: Role };
export type Actor = { id: string; email: string; name: string };
export type DocumentRecord = {
  id: string;
  companyId: string;
  engagementId: string;
  title: string;
  version: number;
  sha256: string;
  signatories: string[];
  key: string;
  kind: string;
};
export type Approval = {
  id: string;
  reviewerId: string;
  snapshot: string;
  createdAt: number;
  expiresAt: number;
};
export type Source = {
  id: string;
  documentId: string;
  sha256: string;
  signatories: string[];
  reviewedBy: string | null;
  reviewedAt: number | null;
  expiresAt: number;
  revision: number;
};
export type ReleaseRequest = {
  id: string;
  createdBy: string;
  documentId: string;
  destination: "sandbox_primary" | "sandbox_alternate";
  mode: "sandbox" | "terminal3";
  agentIdentity: string | null;
  policyVersion: string;
  status: "awaiting_review" | "approved" | "needs_review" | "recorded";
  approval: Approval | null;
  receipt: Receipt | null;
};
export type Receipt = {
  id: string;
  requestId: string;
  snapshot: string;
  documentHash: string;
  destination: string;
  recordedAt: number;
  kind: "internal_sandbox";
  terminal3Proof: null;
};
export type Activity = {
  id: string;
  at: number;
  actorId: string;
  engagementId: string;
  action: string;
  outcome: string;
  details: string;
};
export type Engagement = {
  id: string;
  companyId: string;
  service: string;
  title: string;
  stage: string;
  documents: DocumentRecord[];
  source: Source | null;
  request: ReleaseRequest | null;
};
export type WorkspaceState = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  revision: number;
  companies: { id: string; name: string }[];
  engagements: Engagement[];
  events: Activity[];
};
export type WorkspaceView = {
  authAvailable: boolean;
  mode: "preview" | "workspace";
  actor: Actor | null;
  workspace: WorkspaceState;
  memberships: Member[];
  terminal3: { connected: false; detail: string };
  signInPath: string;
};
export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
