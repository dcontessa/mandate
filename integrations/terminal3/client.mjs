// Server-only, plain Node. Never import this package into the browser or Worker.
import { T3nClient, setEnvironment, loadWasmComponent, eth_get_address, metamask_sign, createEthAuthInput, fetchTrustedManifest } from "@terminal3/t3n-sdk";
export async function authenticateTerminal3(key) {
  if(!key) throw new Error("T3N_API_KEY is required in the server environment.");
  setEnvironment("testnet");
  const address=eth_get_address(key);
  const [wasmComponent,trustAnchor]=await Promise.all([loadWasmComponent(),fetchTrustedManifest("testnet")]);
  const client=new T3nClient({wasmComponent,trustAnchor,handlers:{EthSign:metamask_sign(address,undefined,key)}});
  await client.handshake();
  const identity=await client.authenticate(createEthAuthInput(address));
  if(typeof identity?.value!=="string"||!identity.value.startsWith("did:"))throw new Error("Provider did not return an identity.");
  return {client,did:identity.value};
}
