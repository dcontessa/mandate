import fixture from "../demo-data/Mandate_Demo_Seed.json" with { type: "json" };
import { POLICY_VERSION, SANDBOX_AGENT } from "./domain.ts";
import type { WorkspaceState } from "./types.ts";
const titles: Record<string, string> = {
  doc_board_v1: "Board authority · BR-001",
  doc_bank_v1: "Banking package · original",
  doc_bank_v2: "Banking package · amended terms",
  doc_bank_v3: "Banking package · added signatory",
  doc_accounts_v1: "Management accounts · Aug 2026",
  doc_tax_v1: "Tax preparation · document checklist",
};
export function seedWorkspace(
  id: string,
  ownerId: string,
  now: number,
): WorkspaceState {
  return {
    id,
    ownerId,
    name: "Demo Practice One",
    createdAt: now,
    revision: 0,
    companies: fixture.companies
      .filter((c) => c.tenant_id === "tenant_demo_one")
      .map((c) => ({ id: c.id, name: c.name })),
    engagements: fixture.engagements
      .filter((e) => e.tenant_id === "tenant_demo_one")
      .map((e) => ({
        id: e.id,
        companyId: e.company_id,
        service: e.service,
        title:
          e.id === "eng_alpha_sec"
            ? "Bank signatory mandate"
            : e.service === "accounting"
              ? "Monthly management accounts"
              : e.service === "taxation"
                ? "Tax preparation documents"
                : "Company records review",
        stage: e.state,
        documents: fixture.documents
          .filter((d) => d.engagement_id === e.id)
          .map((d) => ({
            id: d.id,
            companyId: d.company_id,
            engagementId: d.engagement_id,
            title: titles[d.id],
            version: d.version,
            sha256: d.sha256,
            signatories: d.signatory_ids,
            key: `${id}/${e.id}/${d.id}/${d.sha256}.pdf`,
            kind: d.kind,
          })),
        source:
          e.id === "eng_alpha_sec"
            ? {
                id: "auth_alpha_bank",
                documentId: "doc_board_v1",
                sha256: fixture.documents[0].sha256,
                signatories: ["person_a", "person_b"],
                reviewedBy: null,
                reviewedAt: null,
                expiresAt: now + 3600000,
                revision: 0,
              }
            : null,
        request:
          e.id === "eng_alpha_sec"
            ? {
                id: "request_alpha_001",
                createdBy: ownerId,
                documentId: "doc_bank_v1",
                destination: "sandbox_primary",
                mode: "sandbox",
                agentIdentity: SANDBOX_AGENT,
                policyVersion: POLICY_VERSION,
                status: "awaiting_review",
                approval: null,
                receipt: null,
              }
            : null,
      })),
    events: [],
  };
}
export const previewState = seedWorkspace(
  "preview",
  "preview-preparer",
  Date.UTC(2026, 8, 7, 12),
);
