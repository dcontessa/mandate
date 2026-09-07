import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';
const runtime=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('../dist/server/index.js',import.meta.url)),modulesRoot:fileURLToPath(new URL('../dist/server/',import.meta.url)),modulesRules:[{type:'ESModule',include:['**/*.js'],fallthrough:true}],compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],serviceBindings:{ASSETS:()=>new Response('Not found',{status:404})},d1Databases:['DB'],r2Buckets:['BUCKET']});
after(()=>runtime.dispose());
test('production Worker renders the actual Mandate interface',async()=>{
  const r=await runtime.dispatchFetch('https://mandate.test/',{headers:{accept:'text/html'}});
  assert.equal(r.status,200);const html=await r.text();assert.match(html,/Mandate/);assert.match(html,/Bank signatory mandate/);assert.match(html,/Synthetic demo data/);assert.doesNotMatch(html,/Starter Project/);
});
test('production Worker ignores identity headers while authentication mode is unset',async()=>{
  const r=await runtime.dispatchFetch('https://mandate.test/api/mandate',{headers:{'oai-authenticated-user-id':'spoofed','oai-authenticated-user-email':'spoofed@example.test'}});
  assert.equal(r.status,200);const json=await r.json();assert.equal(json.actor,null);assert.equal(json.authAvailable,false);assert.equal(json.mode,'preview');
});
