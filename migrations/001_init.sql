CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, draft jsonb NOT NULL, draft_version integer NOT NULL DEFAULT 0,
  published_revision uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), slot text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing','ready','failed','revoked')),
  original_name text NOT NULL, input_key text NOT NULL, output_key text, preview_key text,
  mime text NOT NULL DEFAULT '', animated boolean NOT NULL DEFAULT false,
  duration double precision, width integer, height integer, error text,
  lease_until timestamptz, attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_owner ON media(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS revisions (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), config jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by text, reason text
);
CREATE INDEX IF NOT EXISTS revision_user ON revisions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_per_user ON revisions(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS revision_assets (
  revision_id uuid NOT NULL REFERENCES revisions(id), asset_id uuid NOT NULL REFERENCES media(id),
  PRIMARY KEY(revision_id, asset_id)
);
CREATE TABLE IF NOT EXISTS catalog (id text PRIMARY KEY, kind text NOT NULL, item jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS pairings (
  id uuid PRIMARY KEY, code_hash text UNIQUE NOT NULL, poll_hash text NOT NULL,
  expected_user_id text NOT NULL, user_id text, expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id uuid PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, target_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox (
  id uuid PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL,
  delivered_at timestamptz, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
