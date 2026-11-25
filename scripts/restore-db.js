import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { resolveBackupDir, resolveDbPath } from '../server/migrations.js'

const dbPath = resolveDbPath()
const backupDir = resolveBackupDir()

function fail(message, details = {}) {
  console.error(JSON.stringify({ level: 'error', msg: 'db_restore_failed', message, ...details }))
  process.exitCode = 1
}

function checkIntegrity(databasePath) {
  const database = new Database(databasePath, { readonly: true })
  try {
    return database.pragma('integrity_check', { simple: true })
  } finally {
    database.close()
  }
}

function latestBackup() {
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

const requested = process.argv[2]
const backupPath = requested ? path.resolve(requested) : latestBackup()

if (!backupPath || !fs.existsSync(backupPath)) {
  fail('backup file not found', { requested: Boolean(requested) })
} else {
  try {
    const stats = fs.statSync(backupPath)
    if (!stats.isFile() || stats.size === 0) throw new Error('backup file is missing or empty')
    if (checkIntegrity(backupPath) !== 'ok') throw new Error('backup integrity_check failed')

    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    for (const suffix of ['-wal', '-shm', '-journal']) {
      fs.rmSync(`${dbPath}${suffix}`, { force: true })
    }

    const temporary = `${dbPath}.restore-${process.pid}`
    fs.copyFileSync(backupPath, temporary)
    try {
      if (checkIntegrity(temporary) !== 'ok') throw new Error('restored file integrity_check failed')
      fs.renameSync(temporary, dbPath)
    } finally {
      fs.rmSync(temporary, { force: true })
    }

    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'db_restored',
        path: dbPath,
        source: backupPath,
        bytes: fs.statSync(dbPath).size,
        integrity: 'ok',
      }),
    )
  } catch (error) {
    fail(error?.message || 'unknown error', { name: error?.name || 'Error' })
  }
}
