import fs from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';

import { MAX_SAMPLES, METRICS_DB_PATH } from '../config.js';

let database;
let retentionLimit = MAX_SAMPLES;

function ensureInitialized() {
  if (!database) {
    throw new Error('Metrics history store has not been initialized yet.');
  }
}

function run(sql, params = []) {
  ensureInitialized();

  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve(this);
    });
  });
}

function all(sql, params = []) {
  ensureInitialized();

  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function exec(sql) {
  ensureInitialized();

  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function initializeMetricsHistoryStore({
  databasePath = METRICS_DB_PATH,
  retention = MAX_SAMPLES,
} = {}) {
  if (database) {
    retentionLimit = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : null;

    if (retentionLimit != null) {
      await run(
        'DELETE FROM metrics_samples WHERE id NOT IN (SELECT id FROM metrics_samples ORDER BY id DESC LIMIT ?)',
        [retentionLimit],
      );
    }

    return;
  }

  if (!databasePath) {
    throw new Error('A database path must be provided to initialize the metrics history store.');
  }

  const resolvedDatabasePath = path.resolve(databasePath);
  await fs.mkdir(path.dirname(resolvedDatabasePath), { recursive: true });

  database = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(resolvedDatabasePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(instance);
    });
  });

  await exec('PRAGMA journal_mode = WAL;');
  await exec(`
    CREATE TABLE IF NOT EXISTS metrics_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);

  retentionLimit = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : null;

  if (retentionLimit != null) {
    await run(
      'DELETE FROM metrics_samples WHERE id NOT IN (SELECT id FROM metrics_samples ORDER BY id DESC LIMIT ?)',
      [retentionLimit],
    );
  }
}

export async function appendSample(sample) {
  ensureInitialized();

  const timestamp = sample?.timestamp ?? new Date().toISOString();
  const payload = JSON.stringify({ ...sample, timestamp });

  await run('INSERT INTO metrics_samples (timestamp, payload) VALUES (?, ?)', [timestamp, payload]);

  if (retentionLimit != null) {
    await run(
      'DELETE FROM metrics_samples WHERE id NOT IN (SELECT id FROM metrics_samples ORDER BY id DESC LIMIT ?)',
      [retentionLimit],
    );
  }
}

export async function getRecentSamples(limit) {
  ensureInitialized();

  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

  if (effectiveLimit == null) {
    return [];
  }

  const rows = await all('SELECT payload FROM metrics_samples ORDER BY id DESC LIMIT ?', [effectiveLimit]);

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
