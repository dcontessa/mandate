/// <reference types="@cloudflare/workers-types" />
declare namespace Cloudflare { interface Env { DB: D1Database; BUCKET: R2Bucket; MANDATE_AUTH_MODE?: "sites-dispatch"; } }
