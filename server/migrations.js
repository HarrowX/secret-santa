import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { themes } from '../src/data/themes.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = path.join(root, 'server', 'schema.sql')

export function resolveDbPath() {
  return path.resolve(root, process.env.DB_PATH || path.join('data', 'secret-santa.sqlite'))
}

export function resolveBackupDir() {
  return path.resolve(root, process.env.BACKUP_DIR || path.join('data', 'backups'))
}

function hasTable(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
}

function hasColumn(database, table, column) {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((item) => item.name === column)
}

function ensureColumn(database, table, column, definition) {
  if (!hasTable(database, table) || hasColumn(database, table, column)) return
  try {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch (error) {
    if (!String(error.message).includes('duplicate column name')) throw error
  }
}

export function ensureLegacyColumns(database) {
  for (const [table, column, definition] of [
    ['users', 'password_hash', 'TEXT'],
    ['participants', 'identity_token', 'TEXT'],
    ['participants', 'invite_token', 'TEXT'],
    ['participants', 'notes', 'TEXT'],
    ['participants', 'preferred', 'TEXT'],
    ['participants', 'gift_sent_at', 'TEXT'],
    ['participants', 'gift_received_at', 'TEXT'],
    ['games', 'format', 'TEXT'],
    ['questions', 'options', 'TEXT'],
    ['messages', 'recipient_email', 'TEXT'],
    ['messages', 'status', "TEXT NOT NULL DEFAULT 'sent'"],
    ['messages', 'error', 'TEXT'],
    ['messages', 'dedupe_key', 'TEXT'],
    ['chat_messages', 'image_url', 'TEXT'],
    ['themes', 'glow', 'TEXT'],
  ]) {
    ensureColumn(database, table, column, definition)
  }

  if (hasTable(database, 'participants')) {
    database.exec('UPDATE participants SET invite_token = lower(hex(randomblob(12))) WHERE invite_token IS NULL')
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_invite_token ON participants(invite_token)')
    database.exec('CREATE INDEX IF NOT EXISTS idx_participants_identity ON participants(identity_token)')
  }
}

export function createDatabase() {
  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const database = new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  ensureLegacyColumns(database)
  return database
}

export const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up(database) {
      database.exec(fs.readFileSync(schemaPath, 'utf8'))
    },
  },
  {
    version: 2,
    name: 'legacy_columns',
    up(database) {
      ensureColumn(database, 'users', 'password_hash', 'TEXT')
      ensureColumn(database, 'participants', 'invite_token', 'TEXT')
      database.exec('UPDATE participants SET invite_token = lower(hex(randomblob(12))) WHERE invite_token IS NULL')
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_invite_token ON participants(invite_token)')
      ensureColumn(database, 'participants', 'notes', 'TEXT')
      ensureColumn(database, 'participants', 'preferred', 'TEXT')
      ensureColumn(database, 'participants', 'gift_sent_at', 'TEXT')
      ensureColumn(database, 'participants', 'gift_received_at', 'TEXT')
      ensureColumn(database, 'games', 'format', 'TEXT')
      ensureColumn(database, 'messages', 'recipient_email', 'TEXT')
      ensureColumn(database, 'messages', 'status', "TEXT NOT NULL DEFAULT 'sent'")
      ensureColumn(database, 'messages', 'error', 'TEXT')
      ensureColumn(database, 'messages', 'dedupe_key', 'TEXT')
      ensureColumn(database, 'themes', 'glow', 'TEXT')
    },
  },
  {
    version: 3,
    name: 'monitoring_storage',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS monitoring_errors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          type TEXT NOT NULL,
          host TEXT,
          path TEXT,
          name TEXT,
          message TEXT
        );
        CREATE TABLE IF NOT EXISTS monitoring_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          host TEXT NOT NULL,
          ok INTEGER NOT NULL,
          status INTEGER,
          latency_ms INTEGER NOT NULL,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_monitoring_errors_created_at ON monitoring_errors(created_at);
        CREATE INDEX IF NOT EXISTS idx_monitoring_checks_created_at ON monitoring_checks(created_at);
        CREATE INDEX IF NOT EXISTS idx_monitoring_checks_host ON monitoring_checks(host);
      `)
      for (const [table, column, definition] of [
        ['monitoring_errors', 'created_at', "TEXT NOT NULL DEFAULT (datetime('now'))"],
        ['monitoring_errors', 'type', 'TEXT NOT NULL'],
        ['monitoring_errors', 'host', 'TEXT'],
        ['monitoring_errors', 'path', 'TEXT'],
        ['monitoring_errors', 'name', 'TEXT'],
        ['monitoring_errors', 'message', 'TEXT'],
        ['monitoring_checks', 'host', 'TEXT NOT NULL'],
        ['monitoring_checks', 'ok', 'INTEGER NOT NULL'],
        ['monitoring_checks', 'status', 'INTEGER'],
        ['monitoring_checks', 'latency_ms', 'INTEGER NOT NULL'],
        ['monitoring_checks', 'error', 'TEXT'],
        ['monitoring_checks', 'created_at', "TEXT NOT NULL DEFAULT (datetime('now'))"],
      ]) {
        ensureColumn(database, table, column, definition)
      }
    },
  },
  {
    version: 4,
    name: 'seed_themes',
    up(database) {
      const insert = database.prepare(`
        INSERT INTO themes (id, name, tag, accent, night, day, glow)
        VALUES (@id, @name, @tag, @accent, @night, @day, @glow)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          tag = excluded.tag,
          accent = excluded.accent,
          night = excluded.night,
          day = excluded.day,
          glow = excluded.glow
      `)
      database.transaction(() => {
        for (const theme of themes) insert.run(theme)
      })()
    },
  },
  {
    version: 5,
    name: 'sync_idempotent_schema',
    up(database) {
      database.exec(fs.readFileSync(schemaPath, 'utf8'))
    },
  },
]

export function applyMigrations(database) {
  database.pragma('busy_timeout = 5000')
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const appliedVersions = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version),
  )
  const applied = []

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue
    database.transaction(() => {
      migration.up(database)
      database
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name)
    })()
    applied.push(migration.version)
  }

  return { applied, total: migrations.length }
}

export function openDatabase() {
  const database = createDatabase()
  applyMigrations(database)
  return database
}
