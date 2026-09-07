// No proof is written unless a real handshake and authentication succeed.
if(!process.env.T3N_API_KEY){console.error("NOT RUN: T3N_API_KEY is unavailable. No live identity or grant has been verified.");process.exit(2);}
try { const {authenticateTerminal3}=await import("./client.mjs");const {did}=await authenticateTerminal3(process.env.T3N_API_KEY);console.log(JSON.stringify({observedAt:new Date().toISOString(),environment:"testnet",operation:"authenticate",did,grantVerified:false,externalDelivery:false})); }
catch { console.error("Terminal 3 authentication failed. No live proof was recorded; inspect the provider connection privately.");process.exitCode=1; }
