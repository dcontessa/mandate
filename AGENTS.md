# Mandate build instructions

Read README.md and docs/security.md before changing the approval or release flow.

- Preserve the name Mandate and the company-secretarial-first scope.
- Only synthetic fixtures belong in this repository. Exclude UBT/APAD and client-sensitive files.
- Keep authentication and engagement checks server-side. Never add a public role switcher or trust identity headers outside a protected dispatcher.
- Approval binds the exact source, file, version, recipient, agent, policy and expiry. Models must never approve themselves.
- Internal sandbox receipts are not Terminal 3 proofs or external delivery receipts.
- Terminal 3 live execution must remain disabled until its identity, grant, contract and receiver are implemented and verified.
- Do not create another Site after a quota failure. No Site project_id is currently provisioned.
- Run type checking, the control suite, build, and compiled Worker smoke tests after material control changes. Keep documentation and limitations honest.
- Update the existing Mandate Web Apps Notion record when the connected tool is available; do not create duplicate project pages.
