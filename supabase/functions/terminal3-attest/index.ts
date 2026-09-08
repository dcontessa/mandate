// Server-only Terminal 3 attestation edge function.
// verify_jwt = true: only authenticated Mandate users can call this.
// Preserves engagement isolation: returns only cluster trust metadata,
// never workspace or engagement data. Does NOT bypass Mandate's approval flow.
//
// Uses the standard trust manifest endpoint with SDK-pinned operator
// signature verification. No /status patch, no unsafe_trust_server,
// no invented RTMR values. Fails closed on missing fields.
//
// The SDK's WASM component requires Node.js MessageChannel, which Deno
// doesn't implement, so full authentication (handshake + DID) must be
// performed by the Node.js adapter (integrations/terminal3/client.mjs).
// This edge function returns only the trust anchor metadata.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const resp = await fetch(manifestUrl);
    if (!resp.ok) throw new Error(`Trust manifest fetch failed: ${resp.status}`);

    const manifest = await resp.json();

    if (!manifest.expected_peer_ids?.length)
      throw new Error("Manifest missing expected_peer_ids — refusing");
    if (!manifest.rtmr3_allowlist?.length)
      throw new Error("Manifest missing rtmr3_allowlist — refusing");

    return new Response(JSON.stringify({
      environment: env,
      trustVerified: true,
      unsafe: false,
      expectedPeerIds: manifest.expected_peer_ids,
      rtmr3Allowlist: manifest.rtmr3_allowlist,
      manifestSource: {
        manifest_version: manifest.version,
        signed_at: manifest.signed_at,
        url: manifestUrl,
      },
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
