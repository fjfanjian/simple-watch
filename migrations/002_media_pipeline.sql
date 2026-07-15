ALTER TABLE uploads ADD COLUMN filename TEXT;
ALTER TABLE uploads ADD COLUMN mime TEXT;
ALTER TABLE uploads ADD COLUMN upload_token_hash TEXT;

ALTER TABLE media_jobs ADD COLUMN payload_json TEXT;
ALTER TABLE media_jobs ADD COLUMN worker_id TEXT;
ALTER TABLE media_jobs ADD COLUMN lease_token_hash TEXT;
ALTER TABLE media_jobs ADD COLUMN progress_json TEXT;

CREATE INDEX media_jobs_claim_idx ON media_jobs(state, not_before, lease_until);
CREATE INDEX uploads_state_idx ON uploads(state, expires_at);

