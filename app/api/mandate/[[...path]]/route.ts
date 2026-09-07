import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { handleApi } from "@/lib/http";
import { Repository } from "@/lib/repository";
import fixtureBytes from "@/lib/fixture-bytes.json";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const h = await headers(),
    user =
      env.MANDATE_AUTH_MODE === "sites-dispatch"
        ? await getChatGPTUser()
        : null,
    id = h.get("oai-authenticated-user-id");
  // Trusted only behind the Sites dispatcher, which owns these identity headers.
  return handleApi(request, {
    authAvailable: env.MANDATE_AUTH_MODE === "sites-dispatch",
    actor:
      user && id ? { id, email: user.email, name: user.displayName } : null,
    repo: new Repository(env.DB),
    fixtureBytes,
    now: () => Date.now(),
    files: {
      get: async (key) => {
        const f = await env.BUCKET.get(key);
        return f ? new Uint8Array(await f.arrayBuffer()) : null;
      },
      put: async (key, bytes) => {
        await env.BUCKET.put(key, bytes, {
          httpMetadata: { contentType: "application/pdf" },
        });
      },
    },
  });
}
export const GET = handle;
export const POST = handle;
