import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.AGENT_DATA_DIR
  ? path.resolve(process.env.AGENT_DATA_DIR)
  : path.join(process.cwd(), 'data');

export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DEBUG_DIR = path.join(DATA_DIR, 'debug');
export const PROFILE_DIR = path.join(DATA_DIR, 'browser-profile');

const DB_PATH = path.join(DATA_DIR, 'app.db');

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  for (const dir of [DATA_DIR, UPLOADS_DIR, DEBUG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('busy_timeout = 5000');
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  instance.exec(fs.readFileSync(schemaPath, 'utf8'));
  _db = instance;
  return instance;
}

export function nowIso(): string {
  return new Date().toISOString();
}

let counter = 0;
export function id(prefix: string): string {
  counter = (counter + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
