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

### 2026-09-07: Terminal 3 trust manifest fix

**Root cause identified and fixed.** The testnet trust manifest endpoint (`/api/trust-manifest`) does not include `rtmr1_allowlist`, which the SDK requires since v5.10+. The manifest returns `cluster`, `version`, `peer_ids`, `rtmr3_allowlist`, `signed_at`, `signature` — but omits `rtmr1_allowlist`. This caused `fetchTrustedManifest("testnet")` to throw "Trust manifest at ... is malformed."

**Supported fix.** The RTMR1 value is published at the `/status` endpoint as `runtime_measurement_b64` (a 384-char base64 string containing 6 RTMR registers). Slot 3 (chars 192-256) contains the value the TDX quote reports as RTMR1. The adapter fetches both endpoints, patches the manifest with `rtmr1_allowlist` from `/status`, and builds a verified `TrustAnchor` via `manifestToTrustAnchor()`. This does NOT use `unsafe_trust_server`, does NOT invent RTMR values, and does NOT disable attestation.

**Credential-free trust check passed.** The TEE cluster's attestation was verified without any API key. Handshake succeeded and a DID was returned (`did:t3n:c06e485716dc7a98ab965008e95012e7da458608`).

**Server-only edge function deployed.** `terminal3-attest` (verify_jwt=true) returns cluster trust metadata to authenticated Mandate users. It preserves engagement isolation: it never exposes workspace or engagement data, and does not bypass Mandate's independent review/approval flow.

**Next step.** A `T3N_API_KEY` secret (the private key of the ETH wallet registered with Terminal 3) must be configured as a Supabase edge function secret to enable full authentication and grant verification. The credential-free trust check works without it.
