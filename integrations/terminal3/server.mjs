// Private server-to-server adapter. Never expose its credentials to the browser.
import { createServer } from 'node:http';
import { timingSafeEqual, createPublicKey, verify } from 'node:crypto';
import { authenticateTerminal3 } from './client.mjs';

export function validateTicket(body, config, now = Math.floor(Date.now()/1000)) {
  if (!body || Object.keys(body).sort().join(',') !== 'signature,ticket' || typeof body.ticket !== 'string' || body.ticket.length > 4096 || !/^[0-9a-f]{128}$/.test(body.signature)) throw new Error('INVALID_ENVELOPE');
  const publicKey = createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(config.issuerPublicKey,'hex')]),format:'der',type:'spki'});
  if (!verify(null,Buffer.from(body.ticket),publicKey,Buffer.from(body.signature,'hex'))) throw new Error('INVALID_SIGNATURE');
  const ticket=JSON.parse(body.ticket);
  if(ticket.agentDid!==config.agentDid || ticket.destination!=='sandbox_primary' || ticket.synthetic!==true) throw new Error('SCOPE_MISMATCH');
  if(!Number.isSafeInteger(ticket.issuedAt)||!Number.isSafeInteger(ticket.expiresAt)||ticket.issuedAt>now||ticket.expiresAt<=now||ticket.expiresAt-ticket.issuedAt>60) throw new Error('TICKET_EXPIRED_OR_INVALID');
  return ticket;
}
function sameSecret(actual, expected) {
  const a=Buffer.from(actual||''),b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
export function createBridge({config, execute}) {
  return createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json');
    const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
    if(req.url==='/health'&&req.method==='GET') return send(200,{service:'mandate-terminal3',scope:'synthetic',ready:true});
    if(req.url!=='/deliver'||req.method!=='POST') return send(404,{code:'NOT_FOUND'});
    if(!sameSecret(req.headers.authorization,`Bearer ${config.bridgeSecret}`)) return send(401,{code:'UNAUTHORIZED'});
    let input='',size=0;
    try {
      for await(const chunk of req) {size+=chunk.length;if(size>8192) {send(413,{code:'INPUT_TOO_LARGE'});return;} input+=chunk.toString('utf8');}
      const body=JSON.parse(input);validateTicket(body,config);
      // Enclave validates issuer, caller, expiry and fixed destination again.
      // The receiver must recheck current approval and atomically deduplicate.
      const result=await execute(body);
      send(200,{result});
    } catch {
      // No provider exception text: it may contain submitted request material.
      send(502,{code:'DELIVERY_NOT_CONFIRMED',detail:'Check receiver state before retrying.'});
    }
  });
}
if(import.meta.url===new URL(process.argv[1],'file:').href) {
  const config={bridgeSecret:process.env.MANDATE_BRIDGE_SECRET||'',issuerPublicKey:process.env.MANDATE_ISSUER_PUBLIC_KEY||'',agentDid:process.env.MANDATE_AGENT_DID||'',contractId:process.env.MANDATE_CONTRACT_ID||''};
  if(config.bridgeSecret.length<32||!/^[a-f0-9]{64}$/.test(config.issuerPublicKey)||!config.agentDid.startsWith('did:t3n:')||!config.contractId.startsWith('z:')||!process.env.AGENT_KEY) throw new Error('Required private bridge configuration is missing');
  const {client,did}=await authenticateTerminal3(process.env.AGENT_KEY);
  if(did!==config.agentDid) throw new Error('Authenticated agent identity mismatch');
  const server=createBridge({config,execute:body=>client.executeAndDecode({contract_id:config.contractId,contract_version:'0.1.0',function_name:'deliver',input:body})});
  server.requestTimeout=15000;
  server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Mandate synthetic bridge listening; agent session authenticated.'));
}
