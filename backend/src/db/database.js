/**
 * SQLite database — single file, zero external setup.
 * File lives at backend/data/irdai.db
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'irdai.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id            TEXT PRIMARY KEY,
    target_url    TEXT NOT NULL,
    url_pattern   TEXT,
    status        TEXT DEFAULT 'discovering',  -- discovering | scanning | paused | complete | error
    total_pages   INTEGER DEFAULT 0,
    scanned_pages INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pages (
    id              TEXT PRIMARY KEY,
    scan_id         TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    url             TEXT NOT NULL,
    title           TEXT,
    screenshot_path TEXT,
    overall_risk    TEXT DEFAULT 'PENDING',  -- HIGH | MEDIUM | LOW | CLEAN | ERROR | PENDING
    summary         TEXT,
    dom_signals     TEXT,   -- JSON blob
    manual_review_required INTEGER DEFAULT 0,
    manual_review_reasons  TEXT,  -- JSON array
    analyzed_at     TEXT,
    error_message   TEXT,
    UNIQUE(scan_id, url)
  );

  CREATE TABLE IF NOT EXISTS findings (
    id              TEXT PRIMARY KEY,
    page_id         TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    pattern_id      INTEGER NOT NULL,
    pattern_name    TEXT NOT NULL,
    severity        TEXT NOT NULL,   -- HIGH | MEDIUM | LOW
    evidence        TEXT,
    location        TEXT,
    severity_rule_applied TEXT,
    source          TEXT DEFAULT 'ai',  -- ai | manual
    reviewed_by     TEXT,
    reviewed_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recommendations (
    id         TEXT PRIMARY KEY,
    page_id    TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS manual_findings_queue (
    id           TEXT PRIMARY KEY,
    scan_id      TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    page_url     TEXT NOT NULL,
    page_title   TEXT,
    reasons      TEXT,  -- JSON array of trigger codes
    status       TEXT DEFAULT 'pending',  -- pending | reviewed
    created_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pages_scan ON pages(scan_id);
  CREATE INDEX IF NOT EXISTS idx_findings_page ON findings(page_id);
  CREATE INDEX IF NOT EXISTS idx_recs_page ON recommendations(page_id);
`);

module.exports = db;
