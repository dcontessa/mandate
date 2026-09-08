# Mandate

**Corporate actions, properly authorised.**

Mandate helps professional practices review the right client document, bind approval to its exact version, and stop an action when its authority or scope changes. It sits alongside AutoCount, Excel and existing practice systems.

**Current status: published synthetic prototype, hosted verification incomplete.**

- [Live demo](https://dcontessa-mandate-im-1g30.bolt.host/)
- [2:17 YouTube walkthrough](https://youtu.be/N65O1tgPg7Q) with ElevenLabs narration
- [Verification and known limitations](docs/evidence.md)

The backend uses **Bolt's managed database, authentication, private storage and server functions**. No separate Supabase project was provisioned; the underlying SDK and deployment directory retain that name. Terminal 3 is explicitly disconnected. The submission form is a draft, not a submitted entry.

![Mandate workspace](docs/preview.jpg)

## Start here

- [Architecture and data flow](docs/architecture.md)
- [Security and GATE controls](docs/security.md)
- [Actual test evidence](docs/evidence.md)
- [Demo flow](docs/demo.md)
- [Build log](docs/build-log.md)
- [Synthetic dataset and PDFs](demo-data/README.md)

## The problem

A company secretary receives a banking package. A source record authorises A and B jointly. A reviewer approves one PDF and one recipient. Later somebody changes the terms, adds C, or changes the destination. A normal task-completion checkbox does not tell the release agent whether the exact action is still authorised.

Mandate binds that approval to the complete action snapshot and checks it again at execution. The professional establishes business authority; deterministic application rules enforce the approved scope. Agent identity is a separate control.

## What runs

| Capability | Implemented and checked | Remaining |
|---|---|---|
| Workspace | Client register, scoped work queue, service filters, version comparison, actual synthetic PDFs | Real client pilot and user feedback |
| Authority and approval | Source review, different reviewer identity, exact SHA-256 binding, expiry and changed-snapshot rejection | Two-person hosted browser validation |
| Isolation | Server membership checks on documents, commands, views and exports | Hosted gateway/isolation verification |
| Persistence | Bolt-managed PostgreSQL aggregate/membership model and private storage | Backup and restore verification |
| Internal sandbox | Atomic receipt and activity save; duplicate request returns existing receipt | External receiver and distributed reconciliation |
| Terminal 3 | SDK 5.2.0 verified manifest, real tenant authentication and active tenant lookup; separate Node adapter | Agent identity/credits, scoped grant, controlled receiver and hosted execution |
| Accounting and tax | Synthetic reference documents and access boundaries | Complete service workflows; no AutoCount API integration |
| Auth | Bolt-managed email/password sign-up, sign-in, sign-out; anonymous read-only preview | Email confirmation ON; distinct accounts do not prove distinct people |
| Demo and docs | Reproducible source, fixture pack, 16 control tests, recording plan | Hosted concurrency and practitioner verification |

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4
- **Backend:** Bolt-managed PostgreSQL, Auth, Storage and server functions
- **Database:** PostgreSQL with row-level security (RLS) on all tables
- **Storage:** Private Bolt-managed storage bucket for synthetic PDF fixtures
- **Edge Function:** Deno-based `mandate-api` function handling all protected operations

## Sixty-second exploration

1. Open Alpha's **Board authority record** in Work queue.
2. Open the original v1 PDF and note its file hash.
3. Compare v2: same A+B, different terms and hash. Compare v3: C is added.
4. Open **Authority** to see the required independent source review.
5. Open **Release** for exact recipient, mode, approval and expiry.
6. Open **Activity & evidence**. It starts empty; actual actions populate it.

Anonymous public preview is read-only. After sign-in, a preparer creates an isolated synthetic workspace and invites a separate reviewer. See the complete two-person flow in [demo.md](docs/demo.md).

## Reproduce

Node 20+ required.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The tests execute the actual HTTP handler against an in-memory repository with explicit test identities and a test file adapter. They cover independent review, signatory constraints, snapshot binding, source/approval expiry, Terminal 3 fail-closed, retry deduplication, membership revocation, file integrity, CSRF, input validation, invitation security, and compare-and-swap concurrency.

The Terminal 3 adapter is an isolated package under `integrations/terminal3`. Its inspect command tests SDK imports. Its check command requires a real server-side key and exits with NOT RUN when one is absent. It is not wired to the release route.

## Privacy and claims

All companies, people, figures and documents are wholly invented. No real Macro client report was used. Example emails are not delivery addresses. There is no bank, regulator, payment or AutoCount connection. Do not claim SSM endorsement, legal validity, an immutable audit trail, compliance certification or enterprise production readiness.

## Limitations

- Terminal 3 live execution is intentionally disconnected. Internal sandbox receipts are not Terminal 3 proofs or external delivery confirmations.
- Email confirmation is ON. New users must confirm their mailbox before signing in.
- No emails are sent for invitations. The preparer shares the invitation link manually.
- The edge function uses the service role key for privileged operations (membership creation, invitation claiming). Ordinary clients cannot write to memberships or invitations directly — RLS denies all writes except through the service role.

- Hosted concurrent-release tests have timed out; serialization has not been established by those timeouts.
- The historical Build 01 Worker tests do not validate the migrated Bolt backend.
