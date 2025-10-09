import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import initSqlJs from 'sql.js';

import { MAX_SAMPLES, METRICS_DB_PATH } from '../config.js';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const wasmDirectory = path.resolve(moduleDirectory, '../node_modules/sql.js/dist');

let sqlModulePromise;
let database;
let databaseFilePath;
let retentionLimit = MAX_SAMPLES;
let operationQueue = Promise.resolve();

function ensureInitialized() {
  if (!database) {
    throw new Error('Metrics history store has not been initialized yet.');
  }
}

async function getSqlModule() {
  if (!sqlModulePromise) {
    sqlModulePromise = initSqlJs({
      locateFile: (fileName) => path.join(wasmDirectory, fileName),
    });
  }

  return sqlModulePromise;
}

function enqueue(action) {
  const nextOperation = operationQueue.then(() => action());
  operationQueue = nextOperation.catch(() => {});
  return nextOperation;
}

async function persistDatabase() {
  ensureInitialized();

  const data = database.export();
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  await fs.writeFile(databaseFilePath, buffer);
}

function pruneExcessSamples() {
  if (retentionLimit == null) {
    return;
  }

  database.run(
    'DELETE FROM metrics_samples WHERE id NOT IN (SELECT id FROM metrics_samples ORDER BY id DESC LIMIT ?)',
    [retentionLimit],
  );
}

export async function initializeMetricsHistoryStore({
  databasePath = METRICS_DB_PATH,
  retention = MAX_SAMPLES,
} = {}) {
  if (!databasePath) {
    throw new Error('A database path must be provided to initialize the metrics history store.');
  }

  retentionLimit = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : null;

  const resolvedDatabasePath = path.resolve(databasePath);

  if (database) {
    if (resolvedDatabasePath !== databaseFilePath) {
      databaseFilePath = resolvedDatabasePath;
      await fs.mkdir(path.dirname(databaseFilePath), { recursive: true });
    }

    await enqueue(async () => {
      pruneExcessSamples();
      await persistDatabase();
    });
    return;
  }

  const SQL = await getSqlModule();
  await fs.mkdir(path.dirname(resolvedDatabasePath), { recursive: true });

  let fileContents;
  try {
    fileContents = await fs.readFile(resolvedDatabasePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  database = fileContents ? new SQL.Database(new Uint8Array(fileContents)) : new SQL.Database();
  databaseFilePath = resolvedDatabasePath;

  database.run(`
    CREATE TABLE IF NOT EXISTS metrics_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      payload TEXT NOT NULL
    );
  `);

  pruneExcessSamples();
  await persistDatabase();
}

export async function appendSample(sample) {
  ensureInitialized();

  const timestamp = sample?.timestamp ?? new Date().toISOString();
  const payload = JSON.stringify({ ...sample, timestamp });

  await enqueue(async () => {
    database.run('INSERT INTO metrics_samples (timestamp, payload) VALUES (?, ?)', [timestamp, payload]);
    pruneExcessSamples();
    await persistDatabase();
  });
}

export async function getRecentSamples(limit) {
  ensureInitialized();

  const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;

  if (effectiveLimit == null) {
    return [];
  }

  return enqueue(() => {
    const statement = database.prepare(
      'SELECT payload FROM metrics_samples ORDER BY id DESC LIMIT ?',
      [effectiveLimit],
    );

    try {
      const rows = [];

      while (statement.step()) {
        rows.push(statement.getAsObject());
      }

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
    } finally {
      statement.free();
    }
  });
}
