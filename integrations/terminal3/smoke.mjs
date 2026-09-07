// Credential-free trust check: verifies the TEE cluster's attestation
// without authenticating as a tenant or sending any credential.
// If T3N_API_KEY is set, also attempts full authentication.
import { credentialFreeTrustCheck, authenticateTerminal3 } from "./client.mjs";

const env = "testnet";
const result = { observedAt: new Date().toISOString(), environment: env };

try {
  // 1. Credential-free trust check (no API key needed)
  const trust = await credentialFreeTrustCheck(env);
  result.trustCheck = {
    status: "PASS",
    trustVerified: trust.trustVerified,
    unsafe: trust.unsafe,
    peerIds: trust.expectedPeerIds,
    rtmr3Allowlist: trust.rtmr3Allowlist,
    rtmr1Allowlist: trust.rtmr1Allowlist,
    manifestVersion: trust.manifestSource?.manifest_version,
    manifestSignedAt: trust.manifestSource?.signed_at,
  };

  // 2. If API key is available, attempt full authentication
  if (process.env.T3N_API_KEY) {
    try {
      const { did } = await authenticateTerminal3(process.env.T3N_API_KEY);
      result.authentication = { status: "PASS", did };
      result.grantVerified = false;
      result.externalDelivery = false;
    } catch (authErr) {
      result.authentication = { status: "FAIL", error: authErr.message };
    }
  } else {
    result.authentication = { status: "NOT_RUN", reason: "T3N_API_KEY not set" };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (e) {
  result.trustCheck = { status: "FAIL", error: e.message };
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
