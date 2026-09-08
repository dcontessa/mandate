# Mandate synthetic delivery contract

Registered on testnet as mandate-release v0.1.0 (contract 930), with active status read back. An unconfigured invocation was rejected with CONFIG_UNAVAILABLE. Not wired to the published application. Registration and an
agent grant alone do not prove approval validation or external delivery.

The WASM contract verifies an Ed25519 ticket issued only after the approval
server rechecks current membership, independent approval and the exact snapshot.
It binds workspace, engagement, request, document hash, agent, destination and
expiry. The authenticated calling DID must match the ticket and configured agent.
Tickets expire within 60 seconds. The only destination is Mandate's controlled
synthetic receiver; the caller cannot supply a URL.

The receiver must recheck the live approval/revocation state and atomically
consume a request/snapshot once before returning its own receipt. It must verify
the issuer signature and the private receiver credential stored in the T3 map.
These receiver and approval-server components are not yet connected. The
contract fails closed while its configuration is absent.

Build: `cargo build --release --target wasm32-wasip2`

Tests: `cargo test`

Host WIT definitions are from the MIT-licensed Terminal 3 example:
https://github.com/Terminal-3/z-tenant-flight
