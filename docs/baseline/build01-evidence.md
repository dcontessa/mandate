# Actual verification — 7 September 2026

**18 automated checks passed:** 16 application HTTP/SQLite control tests and 2 compiled Worker smoke tests. TypeScript checking and the production build passed. This evidence supports the described prototype only.

| Check | Observed result | Evidence and scope |
|---|---|---|
| HTTP control suite | 16 passed, 0 failed | [JUnit output](evidence/controls.junit.xml). Real SQLite SQL, injected test identities and test file adapter |
| Compiled Worker | 2 passed, 0 failed | [Worker result](evidence/worker-smoke.txt). Miniflare/workerd, compatibility date 2026-05-22 |
| TypeScript | Pass | `npm run typecheck`, strict checking |
| Production build | Pass | Vinext 0.0.50, React 19.2.6, Next dependency updated to 16.3.4; Worker entrypoint and API route emitted |
| Production dependency audit | 0 reported vulnerabilities | [App report](evidence/app-dependency-audit.json); [T3 adapter report](evidence/terminal3-dependency-audit.json). `npm audit --omit=dev`; not a complete security assessment |
| SDK import check | Pass | [SDK record](evidence/sdk-check.txt), Terminal 3 SDK 5.11.0 in plain Node |
| Live provider authentication | NOT RUN | Missing `T3N_API_KEY`; smoke script exited 2, no DID produced |
| Public deployment | BLOCKED | Sites returned account hosting usage limit. No Site created or unrelated Site changed |
| Hosted identity and two-person browser approval | NOT RUN | Requires deployment and two actual authenticated accounts |
| Human / external model review | NOT RUN for this build | Handoff supplied; no returned findings claimed |

## Acceptance scenario mapping

| Scenario from fixture pack | Evidence in this build | Status |
|---|---|---|
| S01 authorised real T3 release | Internal sandbox workflow passes; no external provider execution | Internal flow PASS; live S01 NOT RUN |
| S02 unauthorised C | Direct HTTP command blocked, no receipt | PASS |
| S03 v2 substituted after v1 approval | Digest mismatch blocked | PASS |
| S04 recipient substituted | Digest mismatch blocked | PASS |
| S05 client/service/tenant crossing | Direct document and command endpoints denied for all three | PASS in HTTP/SQLite harness |
| S06 source expires before execution | Server-time check blocks | PASS |
| S07 missing real T3 outbound grant | Disconnected application mode fails closed; provider grant denial untested | Application block PASS; real S07 NOT RUN |
| S08 external receiver accepts, worker times out | Internal receipt deduplication and stale-save rejection pass | Internal retry PASS; external S08 NOT RUN |
| S09 missing approval/self-approval | Missing review and preparer/agent approvals denied | PASS |

Additional tests cover corrupted stored bytes, reviewer revocation before execution, CSRF, unauthenticated mutation, strict payload validation, invitation scope/reuse, approval expiry, changed policy and concurrent compare-and-swap writes.

## Browser observations

The internal desktop browser rendered the real interface at approximately 1363 CSS pixels wide. Checked work queue navigation, all six document records, v2 comparison with unchanged A+B and a changed hash, authority/release tabs, service selection, no-match search and keyboard search clearing, empty activity evidence, and read-only controls. An earlier development screenshot is included at [preview.jpg](preview.jpg).

No application error was observed during these interactions; captured browser console errors were from the browser extension. The final full-page capture and scrolling operation timed out in the browser service. The available browser API did not provide a verified viewport resize, so mobile-device and 200% enlargement checks are **not claimed**. Responsive CSS is implemented; it still needs actual mobile-browser verification.

## Corrections made during verification

Fixed a JSX handler syntax error, completed Worker runtime types, used an actual Worker emulator for the compiled artifact rather than importing `cloudflare:` modules into Node, and matched the emulator’s supported compatibility date. The first dependency audit found five vulnerable production dependency packages; updated the affected Next.js/transitive dependency versions. Both final production dependency audits reported zero known vulnerabilities.

The public preview disables sign-in controls when trusted authentication is not configured. A new UI is not evidence of enterprise readiness. No immutable-audit, legal compliance, production recovery, provider-delivery or independent-certification claim is made.
