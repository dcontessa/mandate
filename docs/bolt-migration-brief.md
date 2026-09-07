# User update — 8 September 2026

Use Bolt Database with its built-in authentication, private storage and server functions. Do not provision or connect Supabase. This explicit user decision supersedes all Supabase architecture/provisioning instructions below. Preserve all security and acceptance requirements while adapting provider-specific implementation to Bolt. Verify actual Bolt capabilities and report any unmet requirement; never substitute browser-only enforcement.

# Mandate — Bolt migration brief

Prepared 7 September 2026. This is a migration instruction, not a completed Bolt build.

## Caroline: start with the existing source

Use `Mandate_Source_Build_01.zip`, already attached to the Mandate Web Apps Notion record. The ZIP contains a `Mandate/` folder. Preserve a backup.

1. Open a new, empty project in your StackBlitz account. Replace only that empty project's starter files with the contents of the unzipped `Mandate/` folder, so `package.json` is at the project root. Save it, then choose **Open in Bolt**. The imported Cloudflare runtime may not start before migration; do not treat that as missing source or ask Bolt to recreate the product.
2. Alternatively, once the source is in its own GitHub repository, use Bolt's GitHub import. Do not reuse an unrelated repository or application.
3. Attach this brief in Bolt and paste the instruction below. Use an explicitly connected Supabase project dedicated to Mandate when the migration reaches provisioning; do not connect a database belonging to another product.
4. After validation, publish the synthetic demo and connect its source to GitHub. Confirm the repository is public; creating a Bolt-linked repository does not by itself establish public visibility.

No Bolt project, account connection or publication has been performed from this chat. Direct Bolt.new account access was not available here.

## Copy-paste instruction for Bolt

Migrate the imported Mandate application into a working Bolt-compatible full-stack app. Implement the migration, resolve errors and verify the result; do not stop after a plan. Read this brief, `README.md`, `docs/security.md`, `docs/architecture.md`, `docs/evidence.md` and the existing source before editing. Preserve existing product decisions and working controls.

### Product and scope

Name: **Mandate**. Tagline: **Corporate actions, properly authorised.** It is a company-secretarial workspace for a professional practice, alongside AutoCount, Excel and manual processes. Preserve the existing navy/lime design, client register, work queue, document comparison, independent reviews, approvals and activity/evidence screens. Accounting and tax are reference fixtures, not completed modules. Build the workspace itself; do not replace it with a marketing page.

Use the six existing fictional PDFs and dataset. Source BR-001 permits A+B jointly. Package v1 is original; v2 changes the terms while retaining A+B; v3 adds C. A separate reviewer must review authority and approve the exact package and destination. Changes invalidate the approval. Client identity does not grant access to every service engagement.

### Migration architecture

Target: React + TypeScript + Vite, existing shadcn/Radix components and Tailwind theme; Supabase Auth, PostgreSQL and private Storage; authenticated server functions for protected operations; Bolt-compatible public frontend hosting. This is a deliberate migration from the source's Vinext/Cloudflare runtime. Verify current provider APIs before implementing them.

Preserve and adapt:

| Source | Migration requirement |
| --- | --- |
| `components/mandate/`, `components/ui/`, `app/globals.css` | Reuse layout, copy, interaction states and design. Replace only framework-specific routing/imports. |
| `lib/domain.ts`, `lib/types.ts` | Retain deterministic authorisation, canonical snapshot, hash checks and explicit effect boundary. Run enforcement on the server. |
| `lib/http.ts` | Preserve validation, scoped response filtering and errors; adapt its identity, database and file dependencies. |
| `lib/repository.ts`, `db/schema.ts`, `drizzle/` | Migrate SQLite/D1 operations to PostgreSQL with transactions and revision checks. Do not merely change SQL placeholders. |
| `app/chatgpt-auth.ts`, current API route | Replace with provider-verified server identity. Never trust supplied user IDs, roles, email headers or the old Sites identity headers. |
| `lib/fixture-bytes.json`, `demo-data/` | Preserve exact synthetic bytes and expected SHA-256 hashes; seed protected copies into private storage. |
| `tests/`, `docs/` | Preserve original evidence, add migration-specific results and update setup instructions truthfully. |
| `integrations/terminal3/` | Preserve the separate Node SDK adapter and disabled integration status. |

Sites deployment metadata and build helpers do not configure Bolt hosting. Remove or replace platform-only configuration in the migrated copy when obsolete; retain the original archive as the baseline. Do not register another ChatGPT Site, invent a Site ID, or weaken the source's security instructions to make the port run.

### Required security and persistence behaviour

- Anonymous visitors can explore only the allowlisted synthetic preview. Protected writes need a verified authenticated session. Provide actual sign-in/sign-out and an explicit **Create my sandbox** action.
- Preserve one isolated owned workspace per account. Invitations must be single-use, expire after 24 hours, bind to the invited verified email, and grant reviewer access only to the specified engagement. Creating an invite link must not silently send an email.
- Check current engagement membership on every protected view, document, command and export. A preparer cannot approve their own request, even if their role changes later. Never add a public role switcher or self-approval bypass for the demo.
- Enable row-level security on application tables and private storage. Do not give a browser direct access to an entire workspace aggregate: it contains engagements the caller may not be allowed to see. Return only the server-filtered view. Privileged keys stay server-side.
- Preserve approval binding to workspace/company/engagement, request, source identity/hash/revision/expiry/reviewer, exact PDF/version/hash/signatories, recipient, action, execution mode, agent identity, policy and approval expiry. Use trusted server time.
- Recheck source validity, file bytes and digest, exact signatory set, preparer/reviewer separation and current permissions before a receipt can be committed. Reject expired authority, stale approval, changed document/recipient/policy and corrupt bytes.
- Commit receipt, activity and revision changes atomically with concurrency protection. Current authorisation must remain valid at the commit boundary, including concurrent membership revocation. A repeated completed request returns its existing internal receipt; two simultaneous releases must not create two receipts. Freeze completed requests.
- Do not let ordinary clients call a privileged SQL function that writes arbitrary workspace JSON. Restrict internal transaction functions to the trusted server boundary and validate every request there. Avoid unsafe SECURITY DEFINER/search-path configurations.
- Preserve strict schemas, bounded request bodies, origin/CSRF protection appropriate to the actual cookie or bearer-token flow, a narrow CORS policy where needed, and safe error messages. Server credentials never enter Vite public variables, browser bundles, logs or documentation.

### Terminal 3: honest integration boundary

The supplied SDK is `@terminal3/t3n-sdk` 5.11.0. Its Node import was verified; live authentication, agent DID, grant, TEE execution and receiver delivery were not run. The current app creates an **internal sandbox database receipt only**, with no external delivery and no Terminal 3 proof.

Keep Terminal 3 mode disabled until real owner/agent credentials, identity, scoped permissions, supported execution and an authorised receiver are implemented and tested. Do not assume Node/WASM compatibility in an edge function. Retain a separate server adapter unless the actual intended runtime is verified. Request credentials only through an appropriate secret-entry mechanism, never source code or chat copy.

Do not add an LLM, AutoCount integration, real client uploads, payments, regulatory filings or outbound email as part of this migration. Missing sponsor integration is a documented next stage, not a reason to fabricate a DID or receipt.

### Acceptance and delivery

The original build passed 16 HTTP/SQLite control tests and 2 compiled Cloudflare Worker smoke tests. Those passes are historical evidence for the original build, not proof of a successful Bolt migration. Port meaningful cases to the new backend and record actual results.

Verify the approved internal receipt; rejection of added C, changed v2, changed recipient, expiry, self-approval, revoked membership, corrupt bytes and wrong company/service/tenant access; single-use email-bound invitations; concurrent saves/releases; retries after a lost response; and disconnected Terminal 3. Include attempts to bypass controls through direct authenticated database/storage/API access. No client-side warning counts as enforcement.

Run type checking, production build and the migrated control suite. Exercise desktop/mobile navigation and document access. Test the hosted flow using two real consenting test accounts when available; otherwise mark it NOT RUN. Separate local checks from hosted provider checks. Keep all data synthetic.

Deliver the actual public demo URL after a successful deployment, source repository link and verified visibility, updated README with architecture/setup/evidence, an accurate 3-minute demo script, and a short list of remaining blockers. Preserve the name and scope. Do not claim enterprise production readiness, SSM endorsement, legal validity, immutable audit records, live provider proof or completion of unrun tests. Do not submit the hackathon form, purchase services or send external messages as part of this instruction.

## Documentation checked for this handoff

Official Bolt documentation reviewed on 7 September 2026:

- Supabase integration and Vite compatibility: https://support.bolt.new/integrations/supabase
- File restoration through StackBlitz: https://support.bolt.new/building/using-bolt/rollback-backup
- GitHub import and repository linking: https://support.bolt.new/integrations/git
- Server functions: https://support.bolt.new/cloud/database/server-functions

The proposed migration architecture is our engineering recommendation. The documentation does not establish that Mandate has been imported, its backend ported or its hosted controls tested.
