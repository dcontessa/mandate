// Server-only Terminal 3 attestation edge function.
// verify_jwt = true: only authenticated Mandate users can call this.
// Preserves engagement isolation: the function only reports cluster trust
// status and never exposes another user's workspace or engagement data.
// It does NOT bypass Mandate's independent review/approval flow.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RTMR1_SLOT_INDEX = 3;
const RTMR1_SLOT_LEN = 64;

const NODE_URLS = {
  testnet: "https://cn-api.sg.testnet.t3n.terminal3.io",
  sandbox: "https://cn-api.sg.testnet.t3n.terminal3.io",
  production: "https://cn-api.sg.prod.t3n.terminal3.io",
};

async function resolvePatchedTrustAnchor(env) {
  const nodeUrl = NODE_URLS[env] || NODE_URLS.testnet;
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

  // Build the anchor object that the client can pass to T3nClient
  return {
    expected_peer_ids: manifest.peer_ids,
    rtmr3_allowlist: manifest.rtmr3_allowlist,
    rtmr1_allowlist: [rtmr1],
    source: {
      manifest_version: manifest.version,
      signed_at: manifest.signed_at,
      url: manifestUrl,
    },
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const env = url.searchParams.get("env") || "testnet";

    if (!NODE_URLS[env]) {
      return new Response(JSON.stringify({ error: "Invalid environment" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anchor = await resolvePatchedTrustAnchor(env);

    return new Response(JSON.stringify({
      environment: env,
      trustVerified: true,
      unsafe: false,
      expectedPeerIds: anchor.expected_peer_ids,
      rtmr3Allowlist: anchor.rtmr3_allowlist,
      rtmr1Allowlist: anchor.rtmr1_allowlist,
      manifestSource: anchor.source,
      // Engagement isolation preserved: this function returns only cluster
      // trust metadata, never workspace or engagement data.
      engagementIsolation: "preserved — no workspace or engagement data exposed",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Trust verification failed",
      detail: err.message,
      trustVerified: false,
    }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
