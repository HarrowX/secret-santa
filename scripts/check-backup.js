import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { resolveBackupDir } from '../server/migrations.js'

const backupDir = resolveBackupDir()
const requested = process.argv[2]

function fail(message, details = {}) {
  console.error(JSON.stringify({ level: 'error', msg: 'db_backup_check_failed', message, ...details }))
  process.exitCode = 1
}

function latestBackup() {
  if (!fs.existsSync(backupDir)) return null
  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith('secret-santa-') && name.endsWith('.sqlite'))
    .map((name) => {
      const file = path.join(backupDir, name)
      return { file, mtime: fs.statSync(file).mtimeMs }
    })
    .sort((left, right) => right.mtime - left.mtime)
  return files[0]?.file || null
}

const backupPath = requested ? path.resolve(requested) : latestBackup()

if (!backupPath || !fs.existsSync(backupPath)) {
  fail('backup file not found')
} else {
  try {
    const stats = fs.statSync(backupPath)
    if (!stats.isFile() || stats.size === 0) throw new Error('backup file is missing or empty')
    const database = new Database(backupPath, { readonly: true })
    let integrity
    try {
      integrity = database.pragma('integrity_check', { simple: true })
    } finally {
      database.close()
    }
    if (integrity !== 'ok') throw new Error(`integrity_check: ${integrity}`)
    console.log(
      JSON.stringify({ level: 'info', msg: 'db_backup_checked', path: backupPath, bytes: stats.size, integrity: 'ok' }),
    )
  } catch (error) {
    fail(error?.message || 'unknown error', { name: error?.name || 'Error' })
  }
}
