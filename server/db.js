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

const participantColumns = db.prepare('PRAGMA table_info(participants)').all()
if (!participantColumns.some((column) => column.name === 'invite_token')) {
  db.exec('ALTER TABLE participants ADD COLUMN invite_token TEXT')
}
db.exec(`UPDATE participants SET invite_token = lower(hex(randomblob(12))) WHERE invite_token IS NULL`)
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_invite_token ON participants(invite_token)')

const insertTheme = db.prepare(`
  INSERT INTO themes (id, name, tag, accent, night, day)
  VALUES (@id, @name, @tag, @accent, @night, @day)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    tag = excluded.tag,
    accent = excluded.accent,
    night = excluded.night,
    day = excluded.day
`)

db.transaction(() => {
  for (const theme of themes) insertTheme.run(theme)
})()
