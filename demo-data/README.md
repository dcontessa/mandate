# Mandate - Synthetic Demo Pack

Corporate actions, properly authorised.

## What this pack is

A wholly invented, developer-ready dataset for a Mandate hackathon demonstration. No Macro client reports were supplied, read, anonymised or used to construct it. All organisations, people, amounts and events are fictional. Example email domains are not delivery destinations. There are no genuine signatures, bank accounts, company registration numbers, tax liabilities, API credentials or client identifiers.

This is demo data, not a built application, legal document template, AutoCount export format, statutory tax checklist, security certification or evidence of a successful Terminal 3 call.

## Contents

- `Mandate_Demo_Seed.json`: three companies, two practices, nine actors, five engagements, scoped role assignments, six documents, one source-authority fixture and one unapproved release request.
- `documents/01_Approved_Board_Record.pdf`: fictional professional-reviewed source permitting exactly A+B jointly. This does not itself approve delivery.
- `documents/02_Banking_Package_v1.pdf`: original A+B package for review.
- `documents/03_Banking_Package_v2_Changed.pdf`: changed document content, still A+B, to test stale approval rejection.
- `documents/04_Banking_Package_v3_Unauthorised.pdf`: A+B+C negative test.
- `documents/05_Illustrative_Management_Summary.pdf`: invented accounting amounts for a separate engagement; not exported from AutoCount.
- `documents/06_Tax_Document_Checklist.pdf`: separate tax work-tracking example without statutory dates or computations.
- `Mandate_Demo_Preview.pdf`: seven-page combined preview, included in the ZIP.
- `Fixture_Validation.json`: data-integrity checks only, not app acceptance-test results.
- `build_demo.py`: reproducible generator; Python with reportlab and pypdf required. Rebuilding replaces generated fixture files and may change document hashes, so discard old demo approvals.

## Primary demo narrative

1. Open Demo Company Alpha and its secretarial engagement.
2. Review source BR-001: only Person A and Person B jointly are permitted.
3. Open banking package v1 and show the document/version/recipient awaiting approval.
4. An authenticated reviewer distinct from the preparer approves the exact snapshot through the app.
5. An agent with a real registered Terminal 3 identity and matching permissions attempts the scoped release to a configured sandbox receiver.
6. Show the actual result and actual receiver receipt. If integration has not run, label it simulated or not connected; do not claim verification.
7. Change the document to v2, change the recipient, or request v3 with C. The app must block the action rather than merely show a warning.

Accounting and taxation documents provide realistic workspace content and access-boundary tests. They do not imply those end-to-end service workflows are implemented.

## Implementation note — 7 September 2026

This original pack describes the target integration. The current app is a dedicated synthetic demonstration: an explicit signed-in **Create my sandbox** action creates one isolated copy for that owner, with the preparer restricted to Alpha secretarial. It does not seed a real-client environment automatically or offer a public reset. Source review and human approval start empty. The implemented receipt is an internal database record only; the target Terminal 3/outbound-receiver scenarios below remain pending as stated in `../docs/evidence.md`.

## Integration contract

The JSON is a proposed fixture schema, not a schema supplied by Terminal 3 or AutoCount. Map it to the application data model; do not pass it directly to an SDK as if these fields were supported SDK parameters.

- Load only into an isolated demo environment after an explicit developer seed command. Never seed production automatically or expose a public reset endpoint. Use only fixture identifiers when resetting; do not truncate unrelated records.
- Upsert by stable fixture IDs and retain company, tenant and engagement relationships. Apply real authentication and server-side membership checks. Client-supplied tenant IDs and public role switchers are not authentication.
- Store files privately and maintain server-verified document hashes. Resolve destination IDs through server-controlled configuration; do not let an agent supply arbitrary outbound URLs.
- `source_authorities` are fictional reviewed-source facts, not live verified legal authority. In real use, the professional workflow must establish the source and appropriate approval requirements.
- `human_release_approvals`, `runtime_events`, `terminal3_proofs` and `delivery_receipts` deliberately start empty. Populate them only from actual authorised runtime actions. Do not import expected scenario outcomes into these arrays.
- Request explicit human approval of a canonical snapshot covering all listed `approval_binding_fields`. Bind the actual agent DID once provisioned. Use a separately maintained policy version and bounded approval expiry. Do not allow a model or preparer to approve its own release.
- Enforce business rules, current membership, authority validity and snapshot binding at the final side-effect boundary. Prevent a time-of-check/time-of-use race with a server-controlled immutable approved snapshot and appropriate transaction/locking or equivalent execution controls. A frontend-only check is insufficient.
- Provision Terminal 3 identities and grants using the current official SDK/docs. No SDK calls, DIDs, signatures or attestation receipts are invented by this pack. Keep keys server-side; fail closed when identity, permission or receiver setup is missing.
- The source validity offsets are for deterministic test setup. Set test fixture validity relative to reset time in the test harness. Production checks must use trusted server time and must not accept an arbitrary client-supplied clock.
- For retry tests, implement receiver-side idempotency and receipt reconciliation as well as worker safeguards. An application database flag alone cannot prevent duplicate effects after an uncertain network result.
- Use private test-only receivers. Do not send these documents to real banks, clients, email addresses, regulators, payment networks or AutoCount.

## Acceptance scenarios - expectations, not results

| ID | Scenario | Expected result |
| --- | --- | --- |
| S01 | Exact A+B package, independent human approval, real scoped grant | One sandbox delivery and real receipt |
| S02 | C added without source authority | Block; no delivery |
| S03 | v1 approved, then v2 substituted with A+B unchanged | Block; new review required |
| S04 | Recipient changed after approval | Block; no delivery |
| S05 | Direct API access across client, service and tenant boundaries | Deny each unauthorised access |
| S06 | Source authority expires before execution | Block at execution |
| S07 | Business checks pass but outbound T3 grant is absent | No delivery; capture actual provider denial |
| S08 | Receiver accepted delivery but worker timed out, then retried | Exactly one effect; reconcile existing receipt |
| S09 | No human approval, or preparer/agent self-approval | Deny |

Reset to a clean isolated fixture state before each scenario. Capture a real result for each; do not label tests passed based on this table. S08 deliberately includes an initial delivery and subsequent retry in the same scenario. S05 contains three separate boundary checks.

## Public-demo disclosure

Use a persistent UI banner: `Synthetic demo data - no real client records`.

Suggested narration: "These companies and documents are fictional. The approval, identity check and test delivery you see are live." Use the second sentence only once those operations genuinely run; otherwise state exactly which parts are simulated.

Keep document exports watermarked. Do not claim SSM endorsement, legal certification, a completed banking action, an immutable audit trail or production readiness based on this dataset. Synthetic input protects client confidentiality; it does not remove the need for secure authentication, authorisation, storage and execution.
