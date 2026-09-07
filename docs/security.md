# Security and governance record

Status: working prototype with synthetic data. Not production-ready, certified, legally validated or independently audited.

Highest-consequence failure: an unauthorised document release or cross-client disclosure. The prototype disables external delivery entirely; internal sandbox writes require exact approval and scoped membership.

| Control | Implemented evidence | Limit |
|---|---|---|
| Identity | Dispatcher identity helper plus explicit authentication mode | Hosted sign-in not tested; never trust these headers on an exposed origin |
| Engagement isolation | Scope check before protected loads; filtered views/exports | Automated tests use explicitly injected test identities |
| Independent review | Preparer cannot review source or approve own request | Different account IDs do not prove different people |
| Exact approval | Canonical SHA-256 snapshot and expiry | Professional must establish real business authority |
| Document integrity | Server byte hashes on read/review/release | R2 owner/admin can modify objects; not owner-immutable |
| Duplicate effects | Atomic aggregate receipt and revision check | Internal record only; external timeouts/reconciliation not implemented |
| CSRF and validation | Exact Origin, JSON only, 8 KB streamed body limit, strict command schema | Hosting must supply a correct request origin |
| Secrets | Separate Node-only SDK, environment examples, no embedded keys | Key provisioning, rotation and production secret manager not configured |
| Activity | Actual decisions and blocked attempts, no pre-filled proof | Not an immutable audit log; file-integrity errors return an error without a domain activity entry |
| Bounded sandbox | One owned workspace; 10 invitations; 1,000 activity events | No production abuse service or per-IP rate limit |

## GATE: supporting control model

- **Governance:** named owner, product boundary, prototype status, review method and incident decisions.
- **Authority:** professional-reviewed source, engagement membership and exact approval.
- **Transaction:** deterministic server checks, restricted internal effect, no arbitrary outbound destination.
- **Evidence:** real application events and internal receipts, exact document hashes and actual test output.

GATE is a design aid, not a certification, legal framework approval or separate product. Terminal 3 authenticates agents and can supply scoped execution controls; it does not establish that a board legally adopted a resolution.

## Threats tested

Other-client/service/tenant document and command requests; unauthorized or unauthenticated writes; missing review; self-approval; package and recipient substitution; revoked reviewer; expired source or approval; changed policy; corrupt stored bytes; stale concurrent saves; duplicate internal receipt; reused/wrong-email invitation; unsupported fields; cross-origin requests; disconnected Terminal 3 execution.

See [test evidence](evidence.md). Do not describe a mocked identity or SQLite adapter as a hosted identity or Cloudflare integration test.

## Before any real-data pilot

Named responsibilities and access provisioning; independently verified identity gateway; membership revocation and lifecycle UI; external receiver and grant implementation; API abuse protection; file upload validation/malware scanning; backup and restore drill; incident/support contact; data retention and deletion; jurisdiction/vendor review; browser and practitioner testing with two actual accounts; dependency review and a controlled deployment.

No general client upload endpoint is available. Sample PDFs are wholly invented and watermarked. Accounts/tax samples are not an AutoCount export or a statutory calculation. No bank, regulator, email or real payment system is contacted.

If an integrity check or policy check fails, retain the error, refresh the workspace and resolve the source issue. Do not force an approval through the database. If storage returns an uncertain response, refresh and inspect the existing receipt before retrying. To revoke an exposed future provider key, use its issuer’s revocation process; no provider credential is configured in this build.

## Incident log

### 2026-09-07: Exposed test account credentials and unauthenticated admin-provision endpoint

**Admin-provision endpoint removed.** A temporary POST /admin-provision endpoint existed in the edge function allowing unauthenticated user provisioning (protected only by obscurity and rate limiting). Absence of a user token is not authorization. The endpoint has been removed from source and the cleaned v12 function is deployed. Anonymous POST /admin-provision now returns 401 SIGN_IN_REQUIRED.

**Test account passwords exposed in public source.** Six synthetic test account passwords were hard-coded in tests/hosted-edge.mjs and committed to the repository. All six accounts have been banned (banned_until=2030-12-31) and all sessions revoked via admin SQL. The passwords have been removed from the test file, which now requires a private MANDATE_TEST_ACCOUNTS environment variable. Old credentials are treated as permanently exposed regardless of source removal because Git history retains them. No new users were created and no public provisioning endpoints were added.

**Concurrency evidence corrected.** The hosted-edge evidence file previously described a timeout on concurrent release calls as "not a logic failure." A timeout does not prove serialization is correct. The evidence has been corrected to "unverified." Local control suite verifies serialization logic; hosted concurrent release remains unverified.
