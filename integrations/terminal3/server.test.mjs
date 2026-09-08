import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createBridge,validateTicket} from './server.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const config={issuerPublicKey:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex'),agentDid:'did:t3n:test-agent',bridgeSecret:'private-test-credential-only-no-provider-access'};
function envelope(now=Math.floor(Date.now()/1000)) {
 const ticket=JSON.stringify({workspaceId:'w1',engagementId:'e1',requestId:'r1',snapshot:'a'.repeat(64),documentHash:'b'.repeat(64),agentDid:config.agentDid,destination:'sandbox_primary',issuedAt:now,expiresAt:now+30,synthetic:true});
 return {ticket,signature:sign(null,Buffer.from(ticket),privateKey).toString('hex')};
}
test('bridge rejects tampering, wrong agent and expired ticket',()=>{
 const body=envelope(100);
 assert.equal(validateTicket(body,config,101).requestId,'r1');
 assert.throws(()=>validateTicket({...body,ticket:body.ticket.replace('w1','w2')},config,101),/INVALID_SIGNATURE/);
 assert.throws(()=>validateTicket(body,{...config,agentDid:'other'},101),/SCOPE_MISMATCH/);
 assert.throws(()=>validateTicket(body,config,130),/TICKET_EXPIRED/);
});
test('unauthenticated HTTP request never invokes Terminal 3',async()=>{
 let executions=0;
 const server=createBridge({config,execute:async()=>{executions++;return {synthetic:true};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/deliver`;
 try {
  const denied=await fetch(url,{method:'POST',body:JSON.stringify(envelope())});
  assert.equal(denied.status,401);assert.equal(executions,0);
  const accepted=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${config.bridgeSecret}`},body:JSON.stringify(envelope())});
  assert.equal(accepted.status,200);assert.equal(executions,1);
 }finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
