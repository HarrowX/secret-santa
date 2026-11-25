import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { themes } from '../src/data/themes.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'secret-santa.sqlite')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })

export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.exec(fs.readFileSync(path.join(root, 'server', 'schema.sql'), 'utf8'))

const userColumns = db.prepare('PRAGMA table_info(users)').all()
if (!userColumns.some((column) => column.name === 'password_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT')
}

const participantColumns = db.prepare('PRAGMA table_info(participants)').all()
if (!participantColumns.some((column) => column.name === 'invite_token')) {
  db.exec('ALTER TABLE participants ADD COLUMN invite_token TEXT')
}
db.exec(`UPDATE participants SET invite_token = lower(hex(randomblob(12))) WHERE invite_token IS NULL`)
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_invite_token ON participants(invite_token)')
for (const column of ['notes', 'preferred']) {
  if (!participantColumns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE participants ADD COLUMN ${column} TEXT`)
  }
}

const currentParticipantColumns = db.prepare('PRAGMA table_info(participants)').all()
for (const column of ['gift_sent_at', 'gift_received_at']) {
  if (!currentParticipantColumns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE participants ADD COLUMN ${column} TEXT`)
  }
}

const gameColumns = db.prepare('PRAGMA table_info(games)').all()
if (!gameColumns.some((column) => column.name === 'format')) {
  db.exec('ALTER TABLE games ADD COLUMN format TEXT')
}

const messageColumns = db.prepare('PRAGMA table_info(messages)').all()
for (const [column, definition] of [
  ['recipient_email', 'TEXT'],
  ['status', "TEXT NOT NULL DEFAULT 'sent'"],
  ['error', 'TEXT'],
  ['dedupe_key', 'TEXT'],
]) {
  if (!messageColumns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`)
  }
}

const themeColumns = db.prepare('PRAGMA table_info(themes)').all()
if (!themeColumns.some((column) => column.name === 'glow')) {
  db.exec('ALTER TABLE themes ADD COLUMN glow TEXT')
}

const insertTheme = db.prepare(`
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

db.transaction(() => {
  for (const theme of themes) insertTheme.run(theme)
})()
