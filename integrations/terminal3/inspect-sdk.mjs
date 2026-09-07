import assert from "node:assert/strict";
const sdk=await import("@terminal3/t3n-sdk");
for(const name of ["T3nClient","setEnvironment","loadWasmComponent","eth_get_address","metamask_sign","createEthAuthInput","fetchTrustedManifest"])assert.equal(typeof sdk[name],"function",`Missing export ${name}`);
console.log("PASS: expected SDK exports load in plain Node. No network authentication or outbound grant was tested.");
