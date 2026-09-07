# Run and deploy

## Local preview and tests

Requirements: Node 24+, npm, a shell environment supporting the bundled build scripts (`bash`, GNU `timeout`, `flock`, `curl`, `sha256sum`). The source includes a lockfile. Windows users can use WSL; macOS may need the GNU utilities used by the starter.

```bash
npm ci
npm run dev
```

Use the address printed by the dev server. Local preview is read-only by default. Do not supply fake identity headers or add a public role switcher. Hosted sign-in requires a supported trusted dispatcher.

```bash
npm run typecheck
npm test
npm run build
```

The control tests use Node’s SQLite implementation and the same HTTP handler/domain rules as the Worker. They provision synthetic actors in a test context, exercise the real SQL, and store files in a test adapter. They do not require client records or provider credentials.

## Sites deployment

The logical bindings are `DB` (D1) and `BUCKET` (R2). Versioned schema is in `drizzle/`. No Site was created: account quota rejected the creation request. The hosting manifest intentionally has no `project_id`; do not invent one or reuse an unrelated site’s ID.

After the limit resets, register Mandate once, persist the returned ID, apply migrations through Sites, save the source version, and deploy that version. Only after confirming the app is behind the Sites identity dispatcher should the server environment set `MANDATE_AUTH_MODE=sites-dispatch`. Test two separate real accounts, private document access and every negative release path. Keep the public demonstration limited to synthetic data.

Do not deploy the raw Worker on another public host with dispatcher authentication enabled. For another host, replace the authentication boundary with verified server sessions/JWTs and protect direct origin access first. The Node Terminal 3 adapter also needs a server host with compatible WASM support; it is not part of the browser bundle or the Worker.

## Terminal 3 setup

```bash
cd integrations/terminal3
npm ci --ignore-scripts
npm run inspect
npm run check
```

Inject `T3N_API_KEY` through a secure server environment before `check`. Do not paste credentials into source, Notion, video or a public repo. The smoke script exits 2 with NOT RUN when the key is absent; it writes no pretend DID. A successful authentication result alone does not establish agent registration, an outbound grant or document delivery.

Next required implementation: separately funded agent identity, owner-scoped outbound grant, verified TEE contract/allowed host, approval binding to the actual returned DID, controlled receiver and receiver-side idempotency/reconciliation. Keep Terminal 3 mode disabled until the full execution boundary is tested.

## Repository and submission

No existing Mandate repository was found in the connected `dcontessa` account. The connected GitHub tool set can edit repositories but does not expose repository creation. The source ZIP is ready to import into a new public repository. Do not overwrite an unrelated repository.

The submission form requires a public GitHub link and a YouTube walkthrough of at most three minutes, plus the participant’s name, email and contact number. The supplied deadline is 8 September 2026, 8 pm Malaysia time. Submission has not been made. Preserve the final submission commit and make README sufficient without a Notion login.
