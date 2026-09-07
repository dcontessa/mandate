# Claude / Perplexity review handoff

Review this exact source package and its current evidence, then report the five most important findings before the hackathon deadline. Preserve the name Mandate, the CoSec-first scope and the wholly synthetic-data boundary. Do not rename, redesign or certify the product.

List the files actually inspected. Every finding needs a path, severity, reproducible case, observed vs predicted behaviour, and the smallest corrective action. Mark tests NOT RUN unless you executed them. No real client data, credentials, UBT/APAD material or confidential third-party report is included.

Claude: prioritise HTTP authorisation, snapshot completeness, stale writes, invitation scope, malformed request handling, file integrity and misleading UI. Run `npm test` and inspect `lib/http.ts`, `lib/domain.ts`, `lib/repository.ts` and the actual SQL. Test concurrency and API access rather than only hidden buttons. The hosting identity boundary and real T3 integration are not yet verified; do not fill those gaps with assumptions.

Perplexity: challenge the business value and the distinction between professional business authority, human approval and agent identity. Validate SDK claims against current Terminal 3 primary documentation. There is no AutoCount integration, legal deadline engine or live T3 release in the submitted code so far. Avoid claiming security or commercial validation from a polished screen.

Both: an internal sandbox receipt is an actual application record, not a bank delivery or Terminal 3 proof. Model review supplements practitioner and human end-to-end testing. Do not send messages, publish or change files unless separately authorised.
