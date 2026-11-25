import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { resolveBackupDir, resolveDbPath } from '../server/migrations.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = resolveDbPath()
const backupDir = resolveBackupDir()
const retention = Number.parseInt(process.env.BACKUP_RETENTION || '14', 10)

function fail(message, details = {}) {
  console.error(JSON.stringify({ level: 'error', msg: 'db_backup_failed', message, ...details }))
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

if (!fs.existsSync(dbPath)) {
  fail('database file not found')
} else {
  try {
    fs.mkdirSync(backupDir, { recursive: true })

    const integrity = checkIntegrity(dbPath)
    if (integrity !== 'ok') throw new Error(`integrity_check: ${integrity}`)

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const target = path.join(backupDir, `secret-santa-${stamp}.sqlite`)
    const source = new Database(dbPath, { readonly: true })
    try {
      await source.backup(target)
    } finally {
      source.close()
    }

    const stats = fs.statSync(target)
    if (!stats.isFile() || stats.size === 0) throw new Error('backup file is missing or empty')
    if (checkIntegrity(target) !== 'ok') throw new Error('backup integrity_check failed')

    const offsite = process.env.OFFSITE_BACKUP_COMMAND?.trim()
    if (offsite) {
      const result = spawnSync('sh', ['-c', offsite], {
        cwd: root,
        env: { ...process.env, BACKUP_FILE: target, BACKUP_PATH: target },
        stdio: 'inherit',
      })
      if (result.error) throw result.error
      if (result.status !== 0) throw new Error(`offsite command exited with ${result.status}`)
    }

    const files = fs
      .readdirSync(backupDir)
      .filter((name) => name.startsWith('secret-santa-') && name.endsWith('.sqlite'))
      .map((name) => {
        const file = path.join(backupDir, name)
        return { file, mtime: fs.statSync(file).mtimeMs }
      })
      .sort((left, right) => right.mtime - left.mtime)

    let retained = files.length
    if (Number.isFinite(retention) && retention > 0) {
      for (const item of files.slice(retention)) fs.rmSync(item.file, { force: true })
      retained = Math.min(files.length, retention)
    }

    fs.writeFileSync(
      path.join(backupDir, 'last-success.json'),
      JSON.stringify({ at: new Date().toISOString(), path: target, bytes: stats.size, integrity: 'ok' }, null, 2),
    )

    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'db_backup_created',
        path: target,
        bytes: stats.size,
        integrity: 'ok',
        retained,
        offsite: Boolean(offsite),
      }),
    )
  } catch (error) {
    fail(error?.message || 'unknown error', { name: error?.name || 'Error' })
  }
}
