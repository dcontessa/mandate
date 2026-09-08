# Security and governance

Synthetic prototype only. External delivery and Terminal 3 execution are disabled. Do not use real client records or treat this as a legally validated or independently audited system.

- Verified Bolt-managed user identity and confirmed email are required for protected operations. Invitation identity comes from the verified session, never a caller-supplied email alone.
- Engagement membership scopes views, documents, commands and exports. Ordinary database clients cannot write forged approval/receipt aggregates.
- Independent reviewers establish the source authority and approve an exact action snapshot; preparers cannot self-approve.
- Source and approval expiry, exact PDF byte hashes, signatories, recipient, execution mode and current membership are checked before internal recording.
- PostgreSQL provides the transactional persistence boundary; deployed concurrency and revocation behavior still requires complete verification. See [evidence](evidence.md).
- Email confirmation is ON. Credentials and service secrets must remain outside Git and the browser bundle.
- A generated temporary provisioning route was removed. Generated test credentials accidentally entered public Git history; Bolt reports the six dedicated synthetic accounts banned and sessions revoked. This report still needs independent login-rejection verification; old credentials remain in Git history.
- No admin bypass, public role switcher, unsafe Terminal 3 trust bypass or fabricated provider proof is permitted.

GATE is a design aid: Governance, Authority, Transaction and Evidence. It is not a certification. Professional judgment establishes real business authority; an agent identity does not prove legal board approval.

Before a real pilot: complete hosted adversarial/concurrency and two-person browser checks, remediate test credentials, verify backups/retention/recovery, define practitioner responsibilities and review deployment/API abuse protections.

[Historical Build 01 security notes](baseline/build01-security.md) describe the earlier implementation.

## Incident log

### 8 September 2026 (MYT): Exposed test account credentials and unauthenticated admin-provision endpoint

**Admin-provision endpoint removed.** A temporary POST /admin-provision endpoint existed in the edge function allowing unauthenticated user provisioning (protected only by obscurity and rate limiting). Absence of a user token is not authorization. The endpoint has been removed from source and the cleaned v12 function is deployed. Anonymous POST /admin-provision now returns 401 SIGN_IN_REQUIRED.

**Test account passwords exposed in public source.** Six synthetic test account passwords were hard-coded in tests/hosted-edge.mjs and committed to the repository. All six accounts have been banned (banned_until=2030-12-31) and all sessions revoked via admin SQL. The passwords have been removed from the test file, which now requires a private MANDATE_TEST_ACCOUNTS environment variable. Old credentials are treated as permanently exposed regardless of source removal because Git history retains them. No new users were created and no public provisioning endpoints were added.

**Concurrency evidence corrected.** The hosted-edge evidence file previously described a timeout on concurrent release calls as "not a logic failure." A timeout does not prove serialization is correct. The evidence has been corrected to "unverified." Local control suite verifies serialization logic; hosted concurrent release remains unverified.


Account banning and session revocation above were performed and reported by Bolt. An independent login-rejection verification is still pending.

### 8 September 2026: Terminal 3 compatibility correction

The earlier `/status` RTMR1 patch and its verified-trust claims are retracted.
`manifestToTrustAnchor` converts fields; it does not verify a signature. Learning
an expected measurement from the server being checked is not independent trust.
The Node adapter now pins SDK 5.2.0, recommended in provider developer support,
and uses unmodified `fetchTrustedManifest("testnet")` before handshake and
real-key authentication. A real tenant lookup returned active on 8 September.
This legacy testnet path does not assert SDK 5.11 RTMR1/rootfs pinning.

The edge endpoint returns unavailable rather than constructing trust material.
Agent grant, synthetic receiver, hosted Node runtime and end-to-end execution
remain unverified. The public application's release control stays disabled.
