// Server-only, plain Node. Never import this package into the browser or Worker.
//
// Uses SDK 5.2.0 with the standard signature-verified fetchTrustedManifest.
// No /status patch, no unsafe_trust_server, no invented RTMR values.
// Fails closed if the manifest is missing required fields.
//
// manifestToTrustAnchor in 5.2.0 drops expected_peer_ids from the anchor,
// so we merge it back from the manifest before constructing T3nClient.
import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  fetchTrustedManifest,
  manifestToTrustAnchor,
  isUnsafeTrustServer,
} from "@terminal3/t3n-sdk";

const MANIFEST_URL = "https://cn-api.sg.testnet.t3n.terminal3.io/api/trust-manifest";

export async function resolveTrustAnchor(env = "testnet") {
  setEnvironment(env);
  const manifest = await fetchTrustedManifest(env);

  if (!manifest.expected_peer_ids?.length)
    throw new Error("Trust manifest missing expected_peer_ids — refusing");
  if (!manifest.rtmr3_allowlist?.length)
    throw new Error("Trust manifest missing rtmr3_allowlist — refusing");

  const anchor = manifestToTrustAnchor(manifest, MANIFEST_URL);

  if (isUnsafeTrustServer(anchor))
    throw new Error("Anchor resolved to unsafe — refusing");

  return {
    expected_peer_ids: manifest.expected_peer_ids,
    rtmr3_allowlist: anchor.rtmr3_allowlist,
    source: anchor.source,
  };
}

export async function authenticateTerminal3(key) {
  if (!key) throw new Error("T3N_API_KEY is required in the server environment.");
  setEnvironment("testnet");
  const address = eth_get_address(key);
  const [wasmComponent, trustAnchor] = await Promise.all([
    loadWasmComponent(),
    resolveTrustAnchor("testnet"),
  ]);
  const client = new T3nClient({
    wasmComponent,
    trustAnchor,
    handlers: { EthSign: metamask_sign(address, undefined, key) },
  });
  await client.handshake();
  const identity = await client.authenticate(createEthAuthInput(address));
  if (typeof identity?.value !== "string" || !identity.value.startsWith("did:"))
    throw new Error("Provider did not return an identity.");
  return { client, did: identity.value };
}

export async function credentialFreeTrustCheck(env = "testnet") {
  const anchor = await resolveTrustAnchor(env);
  return {
    environment: env,
    trustVerified: true,
    unsafe: false,
    expectedPeerIds: anchor.expected_peer_ids,
    rtmr3Allowlist: anchor.rtmr3_allowlist,
    manifestSource: anchor.source,
  };
}
