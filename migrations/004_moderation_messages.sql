CREATE TABLE moderation_messages (
  id text PRIMARY KEY, owner_hash text NOT NULL, revision_id uuid NOT NULL,
  erase boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now()
);
