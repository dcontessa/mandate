/*
# Mandate private storage bucket

Creates a private storage bucket for synthetic PDF fixtures.
Objects are keyed by workspace/engagement/document/hash and are only
accessible through authenticated server-side requests (edge function
using the service role key). The browser never receives direct storage URLs.
*/

INSERT INTO storage.buckets (id, name, public, created_at)
VALUES ('mandate-docs', 'mandate-docs', false, now())
ON CONFLICT (id) DO NOTHING;