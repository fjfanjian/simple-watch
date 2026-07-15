ALTER TABLE service_outbox ADD COLUMN worker_id TEXT;
ALTER TABLE service_outbox ADD COLUMN lease_token_hash TEXT;

CREATE INDEX service_outbox_claim_idx
  ON service_outbox(state, not_before, lease_until);
