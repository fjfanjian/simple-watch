CREATE TABLE broadcast_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  path TEXT NOT NULL UNIQUE,
  token_ciphertext TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  rotated_at INTEGER NOT NULL
);
