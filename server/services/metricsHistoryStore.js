import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { MAX_SAMPLES, METRICS_DB_PATH } from '../config.js';

let database;
let insertSampleStatement;
let selectRecentStatement;
let pruneSamplesStatement;
let retentionLimit = MAX_SAMPLES;

function ensureInitialized() {
  if (!database) {
    throw new Error('Metrics history store has not been initialized yet.');
  }
}

export function initializeMetricsHistoryStore({
  databasePath = METRICS_DB_PATH,
  retention = MAX_SAMPLES,
} = {}) {
  if (database) {
    return;
  }

  if (!databasePath) {
    throw new Error('A database path must be provided to initialize the metrics history store.');
  }

  const resolvedDatabasePath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

  database = new Database(resolvedDatabasePath);
  database.pragma('journal_mode = WAL');
  database
    .prepare(
      `CREATE TABLE IF NOT EXISTS metrics_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        payload TEXT NOT NULL
      )`,
    )
    .run();

  insertSampleStatement = database.prepare(
    'INSERT INTO metrics_samples (timestamp, payload) VALUES (?, ?)',
  );
  selectRecentStatement = database.prepare(
    'SELECT payload FROM metrics_samples ORDER BY id DESC LIMIT ?',
  );
  pruneSamplesStatement = database.prepare(
    'DELETE FROM metrics_samples WHERE id NOT IN (SELECT id FROM metrics_samples ORDER BY id DESC LIMIT ?)',
  );

  retentionLimit = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : null;
}

export function appendSample(sample) {
  ensureInitialized();

  const timestamp = sample?.timestamp ?? new Date().toISOString();
  const payload = JSON.stringify({ ...sample, timestamp });

  insertSampleStatement.run(timestamp, payload);

  if (retentionLimit != null) {
    pruneSamplesStatement.run(retentionLimit);
  }
}

export function getRecentSamples(limit) {
  ensureInitialized();

  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

  if (effectiveLimit == null) {
    return [];
  }

  const rows = selectRecentStatement.all(effectiveLimit);

  return rows
    .map((row) => {
      try {
        return JSON.parse(row.payload);
      } catch (error) {
        console.warn('Discarding malformed metrics payload from history store:', error);
        return null;
      }
    })
    .filter((value) => value != null)
    .reverse();
}
