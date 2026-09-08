import { authenticateTerminal3 } from './client.mjs';
import { TenantClient, getNodeUrl } from '@terminal3/t3n-sdk';
const result = { observedAt: new Date().toISOString(), sdk: '5.2.0', environment: 'testnet', authenticated: false, tenantActive: false, grantVerified: false, externalDelivery: false };
if (!process.env.T3N_API_KEY) {
  console.log(JSON.stringify({...result, status:'NOT_RUN', reason:'T3N_API_KEY not set'}));
  process.exit(2);
}
try {
  const { client, did } = await authenticateTerminal3(process.env.T3N_API_KEY);
  result.authenticated = true;
  const tenant = new TenantClient({t3n:client,baseUrl:getNodeUrl(),tenantDid:did});
  const me = await tenant.tenant.me();
  result.tenant = me;
  result.tenantActive = me?.status === 'active';
  result.status = result.tenantActive ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(result,null,2));
  process.exit(result.tenantActive ? 0 : 1);
} catch {
  console.error(JSON.stringify({...result,status:'FAIL',reason:'Terminal 3 authentication or tenant lookup failed'}));
  process.exit(1);
}
