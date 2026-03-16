-- Market Signal Terminal — PostgreSQL schema
-- Run on Supabase DB: docker exec supabase-db psql -U postgres -f /tmp/schema.sql

CREATE SCHEMA IF NOT EXISTS market_signal;

CREATE TABLE IF NOT EXISTS market_signal.sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    TEXT UNIQUE NOT NULL,
  topic         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running',
  step          TEXT NOT NULL DEFAULT 'plan',
  progress      REAL NOT NULL DEFAULT 0,
  meta          JSONB DEFAULT '{}',
  published     BOOLEAN DEFAULT FALSE,
  slug          TEXT UNIQUE,
  asset_key     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_slug ON market_signal.sessions(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_asset ON market_signal.sessions(asset_key, status);

CREATE TABLE IF NOT EXISTS market_signal.session_events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES market_signal.sessions(session_id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON market_signal.session_events(session_id);
