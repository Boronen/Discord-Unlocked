CREATE TABLE studio_presets (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, draft jsonb NOT NULL, version integer NOT NULL DEFAULT 0,
  approved_revision_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_presets_owner ON studio_presets(owner_id);
CREATE TABLE studio_preset_assets (
  preset_id uuid NOT NULL REFERENCES studio_presets(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY(preset_id,asset_id)
);
ALTER TABLE media ADD COLUMN erase_after timestamptz;
ALTER TABLE users ADD COLUMN default_preset_id uuid;
ALTER TABLE users ADD COLUMN manual_revision_id uuid;
ALTER TABLE users ADD COLUMN auto_revision_id uuid;
ALTER TABLE users ADD COLUMN auto_session_hash text;
ALTER TABLE users ADD COLUMN auto_lease_until timestamptz;
ALTER TABLE users ADD COLUMN automation_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE revisions ADD COLUMN preset_id uuid;
ALTER TABLE revisions ADD COLUMN baseline_revision_id uuid;
ALTER TABLE revisions ADD COLUMN activate_on_approval boolean NOT NULL DEFAULT true;
INSERT INTO studio_presets(id,owner_id,name,draft,version,approved_revision_id)
SELECT gen_random_uuid(),id,'My profile',draft,draft_version,published_revision FROM users;
UPDATE users u SET default_preset_id=p.id,manual_revision_id=u.published_revision FROM studio_presets p WHERE p.owner_id=u.id;
UPDATE revisions r SET preset_id=u.default_preset_id FROM users u WHERE r.user_id=u.id;
INSERT INTO studio_preset_assets(preset_id,asset_id)
SELECT DISTINCT p.id,m.id FROM studio_presets p CROSS JOIN LATERAL (VALUES(p.draft->>'avatar'),(p.draft->>'banner'),(p.draft->>'audio'),(p.draft->'effect'->>'id'),(p.draft->'decoration'->>'id')) v(id)
JOIN media m ON m.id::text=v.id AND m.owner_id=p.owner_id;
CREATE TABLE studio_library (
  owner_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  document jsonb NOT NULL DEFAULT '{"favorites":[],"recent":[],"collections":[]}', version integer NOT NULL DEFAULT 0
);
CREATE TABLE studio_automation (
  owner_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rules jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 0
);
CREATE TABLE studio_media_meta (
  media_id uuid PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
  document jsonb NOT NULL DEFAULT '{"label":"","folder":"","tags":[]}'
);
CREATE TABLE studio_shares (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL, copy_uploads boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK(status IN('pending','approved','rejected','withdrawn','revoked')),
  reason text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by text
);
CREATE UNIQUE INDEX studio_share_pending ON studio_shares(owner_id) WHERE status='pending';
CREATE TABLE studio_share_variants (
  share_id uuid NOT NULL REFERENCES studio_shares(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES revisions(id), name text NOT NULL, position integer NOT NULL,
  PRIMARY KEY(share_id,revision_id)
);
CREATE TABLE studio_imports (
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
  share_id uuid NOT NULL, preset_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,request_id)
);
CREATE TABLE media_derivations (
  parent_id uuid NOT NULL, child_id uuid PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE
);
CREATE INDEX media_derivations_parent ON media_derivations(parent_id);
CREATE TABLE studio_badges (
  id uuid PRIMARY KEY, name text NOT NULL, icon text NOT NULL, description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE studio_badge_assignments (
  badge_id uuid NOT NULL REFERENCES studio_badges(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(badge_id,user_id)
);
ALTER TABLE catalog ADD COLUMN metadata jsonb NOT NULL DEFAULT '{"colors":[],"tags":[],"moods":[]}';

ALTER TABLE moderation_messages ALTER COLUMN revision_id DROP NOT NULL;
