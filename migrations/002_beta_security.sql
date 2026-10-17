ALTER TABLE users ADD COLUMN deleted_at timestamptz;
ALTER TABLE users ADD COLUMN admitted_at timestamptz;
UPDATE users SET admitted_at=updated_at;
ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD COLUMN device_name text NOT NULL DEFAULT 'Windows Discord';
ALTER TABLE sessions ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX sessions_id ON sessions(id);
ALTER TABLE media ADD COLUMN input_bytes bigint NOT NULL DEFAULT 0 CHECK(input_bytes>=0);
ALTER TABLE media ADD COLUMN output_bytes bigint NOT NULL DEFAULT 0 CHECK(output_bytes>=0);
ALTER TABLE media ADD COLUMN preview_bytes bigint NOT NULL DEFAULT 0 CHECK(preview_bytes>=0);
ALTER TABLE media ADD COLUMN lease_token uuid;
CREATE TABLE upload_events(id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX upload_events_user ON upload_events(user_id,created_at);
CREATE TABLE admin_confirmations (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), action text NOT NULL CHECK(action='publish'),
  target_id text NOT NULL, draft_version integer NOT NULL, config_hash text NOT NULL,
  code_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, confirmed_at timestamptz, consumed_at timestamptz
);
CREATE TABLE worker_results (
  asset_id uuid PRIMARY KEY REFERENCES media(id), lease_token uuid NOT NULL, result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE erasures(user_hash text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());

-- The restricted decoder sees only an opaque job, never profiles, sessions or tokens.
CREATE FUNCTION claim_media_job() RETURNS TABLE(id uuid,slot text,input_key text,attempts integer,lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE job public.media%ROWTYPE; lease uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(73812023);
  IF EXISTS(SELECT 1 FROM public.media m WHERE m.status='processing' AND m.lease_until>now()) THEN RETURN; END IF;
  SELECT m.* INTO job FROM public.media m JOIN public.users u ON u.id=m.owner_id
    WHERE m.status='processing' AND u.deleted_at IS NULL AND (m.lease_until IS NULL OR m.lease_until<now())
      AND NOT EXISTS(SELECT 1 FROM public.worker_results wr WHERE wr.asset_id=m.id)
    ORDER BY m.created_at FOR UPDATE OF m SKIP LOCKED LIMIT 1;
  IF job.id IS NULL THEN RETURN; END IF;
  lease:=gen_random_uuid();
  UPDATE public.media m SET lease_until=now()+interval '2 minutes',attempts=m.attempts+1,lease_token=lease WHERE m.id=job.id;
  RETURN QUERY SELECT job.id,job.slot,job.input_key,job.attempts,lease;
END $$;
CREATE FUNCTION report_media_job(job_id uuid,token uuid,payload jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF octet_length(payload::text)>8192 THEN RAISE EXCEPTION 'Invalid job result'; END IF;
  PERFORM 1 FROM public.media m WHERE m.id=job_id AND m.lease_token=token AND m.status='processing' AND m.lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.worker_results(asset_id,lease_token,result) VALUES(job_id,token,payload) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION claim_media_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION report_media_job(uuid,uuid,jsonb) FROM PUBLIC;
