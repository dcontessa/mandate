# Verification record — 8 September 2026

This is a synthetic working prototype, not production certification. Local tests and hosted checks are separate evidence layers.

| Check | Observed result | Scope |
|---|---|---|
| Local production build | PASS | TypeScript and Vite build, run after migration |
| Local HTTP controls | 16/16 PASS | In-memory repository and explicit test identities; not PostgreSQL concurrency proof |
| Public deployment | PASS | https://dcontessa-mandate-im-1g30.bolt.host/ rendered in Chrome |
| Public preview | PASS | Two original companies, four engagements, six synthetic PDFs |
| PDF integrity | PASS | All six live sample bytes matched original SHA-256 hashes |
| Anonymous mutations | DENIED | create, command, invitation and join require sign-in |
| Desktop UI | PASS for inspected flows | Service filters, versions, authority, release, documents and clients |
| Mobile UI | PASS for inspected flows | 390 × 844 viewport, no horizontal document overflow; release controls disabled in preview |
| Email confirmation | ON | Verified in Bolt Authentication settings |
| Hosted functional suite | PARTIAL | Bolt reported 41/43 earlier checks; see historical [hosted results](evidence/hosted-edge-results.json). Later cleaned deployment blocked the added-signatory case; full latest suite is not claimed |
| Hosted concurrent release | UNVERIFIED | Requests timed out; timeout does not establish correct serialization |
| Temporary admin route | DENIED after removal | Anonymous POST /admin-provision independently returned 401 |
| Synthetic test credentials | REMEDIATED BY BOLT | Bolt reports six dedicated accounts banned and sessions revoked. Hard-coded credentials removed from current source; old Git history remains exposed. Independent login rejection check not completed |
| YouTube demo | PASS | https://youtu.be/N65O1tgPg7Q uploaded unlisted; player progressed, duration 137.441 seconds |
| Video export | PASS | H.264/AAC, 1920 × 1080, 137.417 seconds; composition runtime/layout/contrast checks passed |
| Terminal 3 | DISCONNECTED | SDK 5.2.0 verifies the unmodified signed manifest; real tenant authentication/active lookup and contract registration pass. Agent grant, receiver and hosted execution remain unverified |
| Hackathon submission | NOT SUBMITTED | Form draft populated, WhatsApp contact pending |

## Remaining verification

Verify the reported account bans independently, rerun hosted concurrency and membership-revocation checks, reconcile deployed SQL to checked-in migrations, and conduct an actual two-person browser walkthrough. Do not use real client records while these are outstanding.

The video illustrates the prototype workflow and source PDFs. It does not show a real Terminal 3 execution or external delivery. Voiceover was generated with ElevenLabs.

[Historical Build 01 evidence](baseline/build01-evidence.md) concerns the earlier Cloudflare build only. Historical provider test artifacts may describe earlier bundles and must not be treated as a current all-green result.
