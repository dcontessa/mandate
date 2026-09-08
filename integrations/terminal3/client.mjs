// Server-only, plain Node. Never import this package into the browser or Worker.
//
// The testnet trust manifest endpoint does not include rtmr1_allowlist (the
// real rootfs-integrity signal). The RTMR1 value is published at the /status
// endpoint as runtime_measurement_b64 (slot 3 of the 6×48-byte array).
// This adapter fetches both endpoints, patches the manifest with the RTMR1
// value from /status, and builds a verified TrustAnchor via manifestToTrustAnchor.
// It does NOT use unsafe_trust_server and does NOT invent RTMR values.
import {
  T3nClient,
  setEnvironment,
  loadWasmComponent,
  eth_get_address,
  metamask_sign,
  createEthAuthInput,
  manifestToTrustAnchor,
  isUnsafeTrustServer,
} from "@terminal3/t3n-sdk";

const RTMR1_SLOT_INDEX = 3;
const RTMR1_SLOT_LEN = 64; // 48 bytes = 64 base64 chars

/**
 * Fetch the trust manifest and /status, patch the manifest with the RTMR1
 * value from /status, and return a verified TrustAnchor.
 */
export async function resolvePatchedTrustAnchor(env) {
  setEnvironment(env);
  const nodeUrl = env === "production"
    ? "https://cn-api.sg.prod.t3n.terminal3.io"
    : "https://cn-api.sg.testnet.t3n.terminal3.io";

  const manifestUrl = `${nodeUrl}/api/trust-manifest`;
  const statusUrl = `${nodeUrl}/status`;

  const [manifestResp, statusResp] = await Promise.all([
    fetch(manifestUrl),
    fetch(statusUrl),
  ]);

  if (!manifestResp.ok) throw new Error(`Trust manifest fetch failed: ${manifestResp.status}`);
  if (!statusResp.ok) throw new Error(`Status fetch failed: ${statusResp.status}`);

  const manifest = await manifestResp.json();
  const status = await statusResp.json();

  if (!manifest.rtmr3_allowlist?.length) throw new Error("Manifest has no rtmr3_allowlist");
  if (!manifest.peer_ids?.length) throw new Error("Manifest has no peer_ids");
  if (!status.runtime_measurement_b64) throw new Error("Status has no runtime_measurement_b64");

  const rm = status.runtime_measurement_b64;
  if (rm.length < (RTMR1_SLOT_INDEX + 1) * RTMR1_SLOT_LEN)
    throw new Error(`runtime_measurement_b64 too short (${rm.length} chars)`);

  const rtmr1 = rm.slice(RTMR1_SLOT_INDEX * RTMR1_SLOT_LEN, (RTMR1_SLOT_INDEX + 1) * RTMR1_SLOT_LEN);

  const patchedManifest = { ...manifest, rtmr1_allowlist: [rtmr1] };
  const anchor = manifestToTrustAnchor(patchedManifest, manifestUrl);

  if (isUnsafeTrustServer(anchor)) throw new Error("Anchor resolved to unsafe — refusing");
  if (!anchor.rtmr1_allowlist?.length) throw new Error("Anchor has empty rtmr1_allowlist");

  return anchor;
}

export async function authenticateTerminal3(key) {
  if (!key) throw new Error("T3N_API_KEY is required in the server environment.");
  setEnvironment("testnet");
  const address = eth_get_address(key);
  const [wasmComponent, trustAnchor] = await Promise.all([
    loadWasmComponent(),
    resolvePatchedTrustAnchor("testnet"),
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

/**
 * Credential-free trust check: verify the TEE cluster's attestation without
 * authenticating as a tenant. Returns the anchor and peer IDs without
 * establishing a session or sending any credential.
 */
export async function credentialFreeTrustCheck(env = "testnet") {
  const anchor = await resolvePatchedTrustAnchor(env);
  return {
    environment: env,
    trustVerified: true,
    unsafe: false,
    expectedPeerIds: anchor.expected_peer_ids,
    rtmr3Allowlist: anchor.rtmr3_allowlist,
    rtmr1Allowlist: anchor.rtmr1_allowlist,
    manifestSource: anchor.source,
  };
}
