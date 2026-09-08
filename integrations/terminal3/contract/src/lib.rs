//! Synthetic delivery contract. Only accepts short-lived tickets signed by the
//! Mandate approval server. Agent callers cannot supply or alter approval facts.
//! The receiver must independently recheck current approval and deduplicate.
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

wit_bindgen::generate!({world: "mandate-release", path: "wit", generate_all});

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope { pub ticket: String, pub signature: String }

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Ticket {
    pub workspace_id: String,
    pub engagement_id: String,
    pub request_id: String,
    pub snapshot: String,
    pub document_hash: String,
    pub agent_did: String,
    pub destination: String,
    pub issued_at: u64,
    pub expires_at: u64,
    pub synthetic: bool,
}

pub fn validate(envelope: &Envelope, public_key: &str, caller: &str, now: u64) -> Result<Ticket, String> {
    if envelope.ticket.len() > 4096 { return Err("TICKET_TOO_LARGE".into()); }
    let key: [u8;32] = hex::decode(public_key).map_err(|_| "INVALID_ISSUER")?.try_into().map_err(|_| "INVALID_ISSUER")?;
    let sig = hex::decode(&envelope.signature).map_err(|_| "INVALID_SIGNATURE")?;
    let sig = Signature::from_slice(&sig).map_err(|_| "INVALID_SIGNATURE")?;
    VerifyingKey::from_bytes(&key).map_err(|_| "INVALID_ISSUER")?
        .verify_strict(envelope.ticket.as_bytes(), &sig).map_err(|_| "INVALID_SIGNATURE")?;
    let ticket: Ticket = serde_json::from_str(&envelope.ticket).map_err(|_| "INVALID_TICKET")?;
    if !ticket.synthetic || ticket.destination != "sandbox_primary" { return Err("DESTINATION_NOT_ALLOWED".into()); }
    if ticket.agent_did != caller { return Err("AGENT_MISMATCH".into()); }
    if ticket.expires_at <= now || ticket.issued_at > now || ticket.expires_at.saturating_sub(ticket.issued_at) > 60 {
        return Err("TICKET_EXPIRED_OR_INVALID".into());
    }
    for value in [&ticket.workspace_id, &ticket.engagement_id, &ticket.request_id] {
        if value.is_empty() || value.len() > 128 { return Err("INVALID_SCOPE".into()); }
    }
    for hash in [&ticket.snapshot, &ticket.document_hash] {
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) {
            return Err("INVALID_HASH".into());
        }
    }
    Ok(ticket)
}

#[cfg(target_arch="wasm32")]
struct Component;
#[cfg(target_arch="wasm32")]
impl exports::mandate::release::contracts::Guest for Component {
    fn deliver(req: exports::mandate::release::contracts::GenericInput) -> Result<Vec<u8>, String> {
        use host::{tenant::tenant_context as ctx, interfaces::{kv_store, http}};
        let input = req.input.ok_or("MISSING_INPUT")?;
        if input.len() > 8192 { return Err("INPUT_TOO_LARGE".into()); }
        let envelope: Envelope = serde_json::from_slice(&input).map_err(|_| "INVALID_ENVELOPE")?;
        let map = format!("z:{}:mandate-config", hex::encode(ctx::tenant_did()));
        let read = |key: &str| -> Result<String,String> {
            let bytes = kv_store::get(&map, key.as_bytes()).map_err(|_| "CONFIG_UNAVAILABLE")?.ok_or("CONFIG_MISSING")?;
            String::from_utf8(bytes).map_err(|_| "INVALID_CONFIG".into())
        };
        let caller = format!("did:t3n:{}", hex::encode(ctx::calling_user_did().ok_or("AUTHENTICATED_AGENT_REQUIRED")?));
        let ticket = validate(&envelope, &read("issuer_public_key")?, &caller, ctx::cluster_timestamp_secs())?;
        if ticket.agent_did != read("agent_did")? { return Err("AGENT_NOT_CONFIGURED".into()); }
        let receiver_secret = read("receiver_secret")?;
        let response = http::call(&http::Request {
            method: http::Verb::Post,
            url: "https://vqzmdotpygxqjqkchrzm.supabase.co/functions/v1/mandate-receiver".into(),
            headers: Some(vec![("Authorization".into(),format!("Bearer {receiver_secret}"))]),
            payload: Some(input),
        }).map_err(|_| "RECEIVER_UNAVAILABLE")?;
        if response.code != 200 && response.code != 201 { return Err(format!("RECEIVER_REJECTED_{}", response.code)); }
        if response.payload.len() > 8192 { return Err("RECEIVER_RESPONSE_TOO_LARGE".into()); }
        Ok(response.payload)
    }
}
#[cfg(target_arch="wasm32")]
export!(Component);

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    fn fixture() -> (Envelope, String) {
        let key = SigningKey::from_bytes(&[42;32]); // Test-only issuer, never deployed.
        let ticket = serde_json::json!({"workspaceId":"w1","engagementId":"e1","requestId":"r1",
            "snapshot":"a".repeat(64),"documentHash":"b".repeat(64),"agentDid":"did:t3n:agent",
            "destination":"sandbox_primary","issuedAt":100,"expiresAt":150,"synthetic":true}).to_string();
        let signature=hex::encode(key.sign(ticket.as_bytes()).to_bytes());
        (Envelope{ticket,signature},hex::encode(key.verifying_key().to_bytes()))
    }
    #[test] fn accepts_signed_scoped_ticket() { let(e,k)=fixture(); assert!(validate(&e,&k,"did:t3n:agent",120).is_ok()); }
    #[test] fn rejects_changed_snapshot() { let(mut e,k)=fixture(); e.ticket=e.ticket.replace(&"a".repeat(64),&"c".repeat(64)); assert_eq!(validate(&e,&k,"did:t3n:agent",120).unwrap_err(),"INVALID_SIGNATURE"); }
    #[test] fn rejects_wrong_agent() { let(e,k)=fixture(); assert_eq!(validate(&e,&k,"did:t3n:other",120).unwrap_err(),"AGENT_MISMATCH"); }
    #[test] fn rejects_expired_ticket() { let(e,k)=fixture(); assert_eq!(validate(&e,&k,"did:t3n:agent",150).unwrap_err(),"TICKET_EXPIRED_OR_INVALID"); }
    #[test] fn rejects_wrong_issuer() { let(e,_)=fixture(); assert!(validate(&e,&hex::encode(SigningKey::from_bytes(&[7;32]).verifying_key().to_bytes()),"did:t3n:agent",120).is_err()); }
}
