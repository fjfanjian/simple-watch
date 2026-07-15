CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  password_changed_at INTEGER NOT NULL
);

CREATE TABLE admin_sessions (
  id_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_admin_id_idx ON admin_sessions(admin_id);
CREATE INDEX admin_sessions_expires_at_idx ON admin_sessions(expires_at);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  max_members INTEGER NOT NULL CHECK (max_members = 5),
  created_by TEXT NOT NULL REFERENCES admin_users(id),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE UNIQUE INDEX rooms_single_active_idx ON rooms(status) WHERE status = 'active';

CREATE TABLE room_members (
  member_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  nickname_folded TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'member')),
  joined_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  left_at INTEGER,
  kicked_at INTEGER
);
CREATE UNIQUE INDEX room_members_active_nickname_idx
  ON room_members(room_id, nickname_folded)
  WHERE left_at IS NULL AND kicked_at IS NULL;
CREATE INDEX room_members_room_id_idx ON room_members(room_id);

CREATE TABLE room_sessions (
  id_hash TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES room_members(member_id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX room_sessions_member_id_idx ON room_sessions(member_id);
CREATE INDEX room_sessions_expires_at_idx ON room_sessions(expires_at);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  state TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  mime TEXT,
  probe_json TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL,
  trashed_at INTEGER
);

CREATE TABLE room_state (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL CHECK (mode IN ('idle', 'vod', 'live')),
  media_id TEXT REFERENCES media(id),
  live_path TEXT,
  transport_json TEXT,
  host_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  updated_at INTEGER NOT NULL
);

CREATE TABLE room_commands (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  result_revision INTEGER NOT NULL,
  result_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, command_id)
);

CREATE TABLE subtitles (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL,
  label TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format = 'webvtt'),
  created_at INTEGER NOT NULL
);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  owner_admin_id TEXT NOT NULL REFERENCES admin_users(id),
  state TEXT NOT NULL,
  declared_bytes INTEGER NOT NULL,
  reserved_bytes INTEGER NOT NULL,
  received_bytes INTEGER NOT NULL DEFAULT 0,
  tus_id TEXT UNIQUE,
  source TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE media_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT REFERENCES media(id),
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER NOT NULL,
  lease_until INTEGER,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE media_transport_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  member_id TEXT NOT NULL REFERENCES room_members(member_id),
  jti_hash TEXT NOT NULL,
  mediamtx_session_id TEXT,
  action TEXT NOT NULL,
  path TEXT NOT NULL,
  connected_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE rtc_revocations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  member_id TEXT NOT NULL REFERENCES room_members(member_id),
  identity TEXT NOT NULL,
  reason TEXT NOT NULL,
  revoked_at INTEGER NOT NULL,
  cleared_at INTEGER
);

CREATE TABLE service_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  not_before INTEGER NOT NULL,
  lease_until INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE token_jti (
  jti_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

