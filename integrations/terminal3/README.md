# Terminal 3 adapter

SDK 5.2.0 is pinned for the testnet manifest, following Terminal 3 developer
support's compatibility guidance. Use the unmodified signed-manifest verification.
Do not patch trust measurements from `/status`.

Real tenant authentication and contract registration are verified. The bridge,
agent grant and controlled receiver are not yet integrated end to end.

Run the tenant check with a private `.env` containing `T3N_API_KEY`:
`node --env-file=.env smoke.mjs`.

The separately hosted Node bridge requires AGENT_KEY, MANDATE_AGENT_DID,
MANDATE_CONTRACT_ID, MANDATE_ISSUER_PUBLIC_KEY, and MANDATE_BRIDGE_SECRET.
Supply them only through the hosting service's private secret manager.
Never put the tenant key in the bridge; it only needs the agent key.

Build the Docker image from this directory. Deploy behind HTTPS. The Bolt server,
not the browser, calls POST /deliver with its private bridge credential and a
short-lived signed approval ticket. Node startup verifies the actual agent DID.
GET /health means only that the bridge has an authenticated agent session; it is
not proof of a grant, receiver delivery, or current business approval.

The application must not enable this route until the Bolt approval-ticket issuer,
current-state receiver validation, atomic receiver deduplication, explicit T3
function/host grant, map ACLs and hosted negative tests are complete. A timeout
means outcome unknown; inspect receiver state before retrying.
