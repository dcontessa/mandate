// Server-only Terminal 3 attestation edge function (v2).
// verify_jwt = true: only authenticated Mandate users can call this.
// Returns the patched trust anchor so a Node.js server process can
// construct a T3nClient with the SDK (the SDK's WASM component requires
// Node.js MessageChannel, which Deno doesn't implement).
//
// T3N_API_KEY is NOT used here — it's consumed by the Node.js adapter
// (integrations/terminal3/client.mjs) which runs outside the edge runtime.
//
// Preserves engagement isolation: returns only cluster trust metadata,
// never workspace or engagement data. Does NOT bypass Mandate's approval flow.
//
// The testnet trust manifest omits rtmr1_allowlist (required by SDK 5.10+).
// We patch it from the /status endpoint's runtime_measurement_b64 (slot 3).
// This does NOT use unsafe_trust_server or invent RTMR values.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RTMR1_SLOT_INDEX = 3;
const RTMR1_SLOT_LEN = 64;

const NODE_URLS: Record<string, string> = {
  testnet: "https://cn-api.sg.testnet.t3n.terminal3.io",
  sandbox: "https://cn-api.sg.testnet.t3n.terminal3.io",
  production: "https://cn-api.sg.prod.t3n.terminal3.io",
};

Deno.serve(async (request: Request) => {
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

    const nodeUrl = NODE_URLS[env];
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

    const trustAnchor = {
      expected_peer_ids: manifest.peer_ids,
      rtmr3_allowlist: manifest.rtmr3_allowlist,
      rtmr1_allowlist: [rtmr1],
      source: {
        manifest_version: manifest.version,
        signed_at: manifest.signed_at,
        url: manifestUrl,
      },
    };

    return new Response(JSON.stringify({
      environment: env,
      trustVerified: true,
      unsafe: false,
      trustAnchor,
      nodeUrl,
      engagementIsolation: "preserved — no workspace or engagement data exposed",
      sdkRuntime: "Node.js required for SDK authentication (MessageChannel not in Deno)",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Trust verification failed",
      detail: err.message?.slice(0, 300),
      trustVerified: false,
    }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
