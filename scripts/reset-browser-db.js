import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultDbPath = path.join(root, 'data', 'browser-test.sqlite')
const protectedDbPaths = new Set([path.join(root, 'data', 'secret-santa.sqlite'), path.join(root, 'data', 'seed.sqlite')])

export function resetBrowserDb(dbPath = defaultDbPath) {
  const target = path.resolve(root, String(dbPath || '').trim() || defaultDbPath)
  if (protectedDbPaths.has(target)) {
    throw new Error('Сброс браузерной БД не может удалить основную или локальную БД')
  }

  const files = [target, `${target}-wal`, `${target}-shm`]
  for (const file of files) fs.rmSync(file, { force: true })
  return files
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    resetBrowserDb()
  } catch (error) {
    console.error(error?.message || 'Не удалось сбросить браузерную БД')
    process.exitCode = 1
  }
}
