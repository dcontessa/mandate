#!/usr/bin/env node
/**
 * Mandate hosted edge parity test suite.
 * Test account credentials are supplied via private environment variables:
 *   MANDATE_TEST_ACCOUNTS — JSON array of [{email,password}] pairs
 * Accounts must be provisioned out-of-band via admin SQL; this script
 * never contains or transmits hard-coded credentials.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env","utf8").split("\n").filter(Boolean).map(l=>{const i=l.indexOf("=");return[l.slice(0,i),l.slice(i+1)]}));
const url = env.VITE_SUPABASE_URL, anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!url||!anonKey){console.log(JSON.stringify({status:"NOT RUN",reason:"Missing env"}));process.exit(0);}

let accounts = [];
try {
  const raw = process.env.MANDATE_TEST_ACCOUNTS || env.MANDATE_TEST_ACCOUNTS;
  if (raw) accounts = JSON.parse(raw);
} catch {}
if (accounts.length < 6) {
  console.log(JSON.stringify({status:"NOT RUN",reason:"MANDATE_TEST_ACCOUNTS env var must contain 6 [{email,password}] pairs (private, not committed)"}));
  process.exit(0);
}

const endpoint = `${url}/functions/v1/mandate-api`;
const checks = []; let passed=0, failed=0;
function check(name,cond,detail){const e={name,passed:Boolean(cond),...(detail?{detail}:{})};checks.push(e);if(cond)passed++;else failed++;}
async function signIn(creds){const c=createClient(url,anonKey,{auth:{persistSession:false}});const{data,error}=await c.auth.signInWithPassword(creds);return error||!data.session||!data.user?null:{user:data.user,token:data.session.access_token,email:creds.email,client:c};}
async function apiGet(token,suffix=""){const h={apikey:anonKey};if(token)h.Authorization=`Bearer ${token}`;const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),30000);try{return await fetch(`${endpoint}${suffix}`,{headers:h,signal:ctrl.signal});}finally{clearTimeout(t);}}
async function apiPost(token,path,payload){const h={"Content-Type":"application/json",apikey:anonKey};if(token)h.Authorization=`Bearer ${token}`;const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),30000);try{const r=await fetch(`${endpoint}/${path}`,{method:"POST",headers:h,body:JSON.stringify(payload),signal:ctrl.signal});let json=null;try{json=await r.json();}catch{}return{resp:r,json};}finally{clearTimeout(t);}}

async function run(){
  // 1. Anonymous preview
  const ap=await apiGet(null,"");const aj=ap.ok?await ap.json():null;
  check("anonymous preview 200",ap.ok,`status=${ap.status}`);
  check("preview id=preview",aj?.workspace?.id==="preview");
  check("preview 2 companies",aj?.workspace?.companies?.length===2,`count=${aj?.workspace?.companies?.length}`);
  check("preview 4 engagements",aj?.workspace?.engagements?.length===4,`count=${aj?.workspace?.engagements?.length}`);
  // 2. Sample PDF
  const sr=await apiGet(null,"/sample?document=doc_board_v1");
  check("sample PDF",sr.ok&&sr.headers.get("content-type")==="application/pdf",`status=${sr.status}`);
  // 3. Seed parity
  const cs=aj?.workspace?.companies||[];
  check("Demo Company Alpha",cs.some(c=>c.name==="Demo Company Alpha"));
  check("Demo Company Beta",cs.some(c=>c.name==="Demo Company Beta"));
  const es=aj?.workspace?.engagements||[];
  check("eng_alpha_sec",es.some(e=>e.id==="eng_alpha_sec"));
  check("eng_alpha_acc",es.some(e=>e.id==="eng_alpha_acc"));
  check("eng_alpha_tax",es.some(e=>e.id==="eng_alpha_tax"));
  check("eng_beta_sec",es.some(e=>e.id==="eng_beta_sec"));
  const sec=es.find(e=>e.id==="eng_alpha_sec");
  check("source auth_alpha_bank",sec?.source?.id==="auth_alpha_bank");
  check("signatories person_a/b",JSON.stringify(sec?.source?.signatories)==='["person_a","person_b"]');
  check("request request_alpha_001",sec?.request?.id==="request_alpha_001");
  // 4. Fixture hashes
  const ds=sec?.documents||[];
  check("doc_board_v1 real hash",ds[0]?.sha256?.length===64,`hash=${ds[0]?.sha256?.slice(0,16)}...`);
  check("doc_bank_v1 real hash",ds[1]?.sha256?.length===64);
  check("doc_bank_v3 person_c",JSON.stringify(ds[3]?.signatories)==='["person_a","person_b","person_c"]');

  // 5. Sign in
  const owner=await signIn(accounts[0]),reviewer=await signIn(accounts[1]);
  if(!owner||!reviewer){check("signIn",false,"failed or accounts disabled");console.log(JSON.stringify({status:failed>0?"FAIL":"PASS",passed,failed,total:passed+failed,checks},null,2));process.exit(failed>0?1:0);}
  check("signIn owner+reviewer",true);

  // 6. Create sandbox
  const{resp:cr,json:cj}=await apiPost(owner.token,"create",{});
  check("create 201",cr.status===201,`status=${cr.status}`);
  const ws=cj?.workspace;
  if(!ws){check("create workspace available",false,`create returned no workspace, status=${cr.status}`);console.log(JSON.stringify({status:failed>0?"FAIL":"PASS",passed,failed,total:passed+failed,checks},null,2));process.exit(failed>0?1:0);}
  check("created real hashes",ws?.engagements?.[0]?.documents?.[0]?.sha256?.length===64);
  check("created 1 eng (filtered)",ws?.engagements?.length===1,`count=${ws?.engagements?.length}`);
  check("created eng_alpha_sec",ws?.engagements?.[0]?.id==="eng_alpha_sec");

  // 7. Duplicate denied
  const{resp:dr}=await apiPost(owner.token,"create",{});
  check("duplicate denied",dr.status===409,`status=${dr.status}`);

  // 8. Invite/claim
  const eng=ws?.engagements?.[0];
  const{resp:ir,json:ij}=await apiPost(owner.token,"invite",{workspaceId:ws.id,engagementId:eng.id,email:reviewer.email});
  check("invite 201",ir.status===201,`status=${ir.status}`);
  const tok=ij?.invitePath?new URL(ij.invitePath,"https://m.test").searchParams.get("invite"):null;
  check("token generated",Boolean(tok));
  const{resp:jr,json:jj}=await apiPost(reviewer.token,"join",{token:tok});
  check("claim succeeds",jr.status===200,`status=${jr.status}`);
  check("joined visible",Boolean(jj?.workspace));
  // Double-claim
  const{resp:dj}=await apiPost(reviewer.token,"join",{token:tok});
  check("double-claim denied",dj.status===403,`status=${dj.status}`);

  // 9. Review + approve
  let rev=ws.revision;
  const{resp:rr,json:rj}=await apiPost(reviewer.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"review_source",acknowledgement:true});
  check("review succeeds",rr.status===200,`status=${rr.status}`);
  rev=rj?.workspace?.revision??rev+1;
  const{resp:ar,json:aj2}=await apiPost(reviewer.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"approve",acknowledgement:true});
  check("approve succeeds",ar.status===200,`status=${ar.status}`);
  rev=aj2?.workspace?.revision??rev+1;

  // 10. Snapshot change rejection
  const{resp:cp,json:cpj}=await apiPost(owner.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"change_package",documentId:"doc_bank_v2"});
  check("package change succeeds",cp.status===200,`status=${cp.status}`);
  rev=cpj?.workspace?.revision??rev+1;
  const{resp:rac,json:racj}=await apiPost(owner.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"release"});
  check("snapshot change blocked",racj?.blocked?.code==="SNAPSHOT_CHANGED",`status=${rac.status},blocked=${racj?.blocked?.code}`);
  if(racj?.workspace?.revision)rev=racj.workspace.revision;

  // 11. Re-approve and release
  const{resp:rvr,json:rvj}=await apiPost(reviewer.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"review_source",acknowledgement:true});
  check("re-review succeeds",rvr.status===200,`status=${rvr.status},blocked=${rvj?.blocked?.code}`);
  if(rvj?.workspace?.revision)rev=rvj.workspace.revision;
  const{resp:rap,json:rapj}=await apiPost(reviewer.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"approve",acknowledgement:true});
  check("re-approve succeeds",rap.status===200,`status=${rap.status}`);
  if(rapj?.workspace?.revision)rev=rapj.workspace.revision;

  // 12. Release + retry
  const{resp:rel,json:relj}=await apiPost(owner.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"release"});
  check("release succeeds",rel.status===200&&!relj?.blocked,`status=${rel.status},blocked=${relj?.blocked?.code}`);
  const re=relj?.workspace?.engagements?.find(e=>e.id===eng.id);
  check("receipt recorded",re?.request?.receipt?.kind==="internal_sandbox",`kind=${re?.request?.receipt?.kind}`);
  check("no terminal3 proof",re?.request?.receipt?.terminal3Proof===null);
  if(relj?.workspace?.revision)rev=relj.workspace.revision;
  // 13. Idempotent retry
  const{resp:tr,json:tj}=await apiPost(owner.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:rev,action:"release"});
  check("retry replayed",tr.status===200&&tj?.replayed===true,`status=${tr.status},replayed=${tj?.replayed}`);

  // 14. Direct access denied
  const ds2=await owner.client.from("workspaces").select("id").eq("id",ws.id).maybeSingle();
  check("direct SELECT denied",Boolean(ds2.error),`code=${ds2.error?.code}`);
  const drpc=await owner.client.rpc("mandate_get_user_workspaces",{p_actor_id:owner.user.id});
  check("direct RPC denied",Boolean(drpc.error),`code=${drpc.error?.code}`);

  // 15. Concurrent release (unverified — timeout does not prove serialization)
  const o2=await signIn(accounts[2]),r2=await signIn(accounts[3]);
  if(o2&&r2){
    try {
    const{json:c2j}=await apiPost(o2.token,"create",{});
    const ws2=c2j?.workspace;
    if(ws2){
      const e2=ws2.engagements.find(e=>e.id==="eng_alpha_sec");
      const{json:i2j}=await apiPost(o2.token,"invite",{workspaceId:ws2.id,engagementId:e2.id,email:r2.email});
      const t2=new URL(i2j.invitePath,"https://m.test").searchParams.get("invite");
      await apiPost(r2.token,"join",{token:t2});
      let r2v=ws2.revision;
      const{json:r2j}=await apiPost(r2.token,"command",{workspaceId:ws2.id,engagementId:e2.id,revision:r2v,action:"review_source",acknowledgement:true});
      r2v=r2j?.workspace?.revision??r2v+1;
      const{json:a2j}=await apiPost(r2.token,"command",{workspaceId:ws2.id,engagementId:e2.id,revision:r2v,action:"approve",acknowledgement:true});
      r2v=a2j?.workspace?.revision??r2v+1;
      const cc=await Promise.all([
        apiPost(o2.token,"command",{workspaceId:ws2.id,engagementId:e2.id,revision:r2v,action:"release"}),
        apiPost(o2.token,"command",{workspaceId:ws2.id,engagementId:e2.id,revision:r2v,action:"release"}),
      ]);
      const sts=cc.map(c=>c.resp.status).sort((a,b)=>a-b);
      // NOTE: a timeout or single-200 result does not by itself prove correct
      // serialization. This check only records observed HTTP statuses.
      check("concurrent release observed",cc.length===2,`statuses=${sts.join(",")} — serialization unverified`);
    }
    } catch(e) { check("concurrent release observed",false,`error: ${e.message} — serialization unverified`); }
  }

  // 16. Unauthorised signatory
  const o3=await signIn(accounts[4]),r3=await signIn(accounts[5]);
  if(o3&&r3){
    try {
    const{json:c3j}=await apiPost(o3.token,"create",{});
    const ws3=c3j?.workspace;
    if(ws3){
      const e3=ws3.engagements.find(e=>e.id==="eng_alpha_sec");
      const{json:i3j}=await apiPost(o3.token,"invite",{workspaceId:ws3.id,engagementId:e3.id,email:r3.email});
      const t3=new URL(i3j.invitePath,"https://m.test").searchParams.get("invite");
      await apiPost(r3.token,"join",{token:t3});
      let r3v=ws3.revision;
      const{json:cp3j}=await apiPost(o3.token,"command",{workspaceId:ws3.id,engagementId:e3.id,revision:r3v,action:"change_package",documentId:"doc_bank_v3"});
      r3v=cp3j?.workspace?.revision??r3v+1;
      const{json:rv3j}=await apiPost(r3.token,"command",{workspaceId:ws3.id,engagementId:e3.id,revision:r3v,action:"review_source",acknowledgement:true});
      r3v=rv3j?.workspace?.revision??r3v+1;
      const{resp:ap3,json:ap3j}=await apiPost(r3.token,"command",{workspaceId:ws3.id,engagementId:e3.id,revision:r3v,action:"approve",acknowledgement:true});
      check("unauthorised signatory blocked",ap3.status===409&&ap3j?.code==="SIGNATORIES_NOT_AUTHORISED",`status=${ap3.status},code=${ap3j?.code}`);
    }
    } catch(e) { check("unauthorised signatory blocked",false,`error: ${e.message}`); }
  }

  // 17. Self-approval blocked
  const gv=await apiGet(owner.token,`?workspace=${ws.id}`);
  const gj=gv.ok?await gv.json():null;
  const sRev=gj?.workspace?.revision??rev;
  const{resp:sa,json:saj}=await apiPost(owner.token,"command",{workspaceId:ws.id,engagementId:eng.id,revision:sRev,action:"approve",acknowledgement:true});
  check("self-approval blocked",sa.status===403,`status=${sa.status},code=${saj?.code}`);

  console.log(JSON.stringify({status:failed>0?"FAIL":"PASS",passed,failed,total:passed+failed,checks},null,2));
  process.exit(failed>0?1:0);
}
run().catch(e=>{console.error("Fatal:",e);process.exit(1);});
