import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.resolve(root, process.env.DB_PATH || path.join('data', 'secret-santa.sqlite'))
const backupDir = path.resolve(root, process.env.BACKUP_DIR || path.join('data', 'backups'))
const retention = Number.parseInt(process.env.BACKUP_RETENTION || '14', 10)

fs.mkdirSync(backupDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = path.join(backupDir, `secret-santa-${stamp}.sqlite`)
const db = new Database(dbPath)

await db.backup(target)
db.close()

const files = fs
  .readdirSync(backupDir)
  .filter((name) => name.startsWith('secret-santa-') && name.endsWith('.sqlite'))
  .map((name) => {
    const file = path.join(backupDir, name)
    return { file, mtime: fs.statSync(file).mtimeMs }
  })
  .sort((left, right) => right.mtime - left.mtime)

if (Number.isFinite(retention) && retention > 0) {
  for (const item of files.slice(retention)) fs.rmSync(item.file, { force: true })
}

console.log(JSON.stringify({ level: 'info', msg: 'db_backup_created', path: target, retained: Math.min(files.length, retention || files.length) }))
