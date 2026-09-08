// No trust material is constructed in this Deno endpoint. The verified SDK
// session runs in the separate Node adapter. Keep gateway JWT verification on.
Deno.serve((request: Request) => {
  if (request.method !== "GET") return new Response(null, {status:405});
  return Response.json({
    connected: false,
    code: "TERMINAL3_WORKFLOW_NOT_VERIFIED",
    detail: "Node tenant authentication verified; agent grant, receiver and hosted integration remain unverified.",
  }, {status:503, headers:{"Cache-Control":"no-store"}});
});
