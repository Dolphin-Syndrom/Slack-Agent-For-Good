import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = path.resolve(config.db.path);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- ── Crises ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS crises (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,           -- flood | wildfire | earthquake | etc.
      location    TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'high',
      status      TEXT NOT NULL DEFAULT 'ACTIVE',
      slack_channel_id  TEXT,
      slack_channel_name TEXT,
      started_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      resolved_at INTEGER,
      summary     TEXT,
      metadata    TEXT DEFAULT '{}'        -- JSON blob for extra data
    );

    -- ── Resources ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS resources (
      id          TEXT PRIMARY KEY,
      crisis_id   TEXT NOT NULL,
      type        TEXT NOT NULL,           -- volunteer | vehicle | shelter | medical | food
      name        TEXT NOT NULL,
      quantity    INTEGER NOT NULL DEFAULT 1,
      unit        TEXT DEFAULT 'units',
      status      TEXT NOT NULL DEFAULT 'available', -- available | allocated | depleted
      location    TEXT,
      contact     TEXT,
      notes       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      FOREIGN KEY (crisis_id) REFERENCES crises(id)
    );

    -- ── Intel Updates ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS intel_updates (
      id          TEXT PRIMARY KEY,
      crisis_id   TEXT NOT NULL,
      source      TEXT NOT NULL,           -- weather | news | usgs | manual
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      severity    TEXT,
      url         TEXT,
      raw_data    TEXT,                    -- JSON
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (crisis_id) REFERENCES crises(id)
    );

    -- ── Comms Drafts ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS comms_drafts (
      id          TEXT PRIMARY KEY,
      crisis_id   TEXT NOT NULL,
      type        TEXT NOT NULL,           -- public_alert | press_release | volunteer_brief | sitrep
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'draft', -- draft | approved | sent
      created_by  TEXT,                    -- Slack user ID
      approved_by TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      FOREIGN KEY (crisis_id) REFERENCES crises(id)
    );

    -- ── A2A Tasks ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS a2a_tasks (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'submitted', -- submitted | working | completed | failed
      input       TEXT NOT NULL,           -- JSON
      output      TEXT,                    -- JSON
      error       TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    -- ── Indexes ──────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_crises_status ON crises(status);
    CREATE INDEX IF NOT EXISTS idx_resources_crisis ON resources(crisis_id);
    CREATE INDEX IF NOT EXISTS idx_intel_crisis ON intel_updates(crisis_id);
    CREATE INDEX IF NOT EXISTS idx_comms_crisis ON comms_drafts(crisis_id);
    CREATE INDEX IF NOT EXISTS idx_a2a_status ON a2a_tasks(status);
  `);
}

export type CrisisRow = {
  id: string;
  type: string;
  location: string;
  severity: string;
  status: string;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  started_at: number;
  updated_at: number;
  resolved_at: number | null;
  summary: string | null;
  metadata: string;
};

export type ResourceRow = {
  id: string;
  crisis_id: string;
  type: string;
  name: string;
  quantity: number;
  unit: string;
  status: string;
  location: string | null;
  contact: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

export type IntelUpdateRow = {
  id: string;
  crisis_id: string;
  source: string;
  title: string;
  content: string;
  severity: string | null;
  url: string | null;
  raw_data: string | null;
  created_at: number;
};

export type CommsDraftRow = {
  id: string;
  crisis_id: string;
  type: string;
  title: string;
  content: string;
  status: string;
  created_by: string | null;
  approved_by: string | null;
  created_at: number;
  updated_at: number;
};
