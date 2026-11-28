import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'
import { resetBrowserDb } from '../scripts/reset-browser-db.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-santa-browser-db-'))
const dbPath = path.join(tmp, 'browser-test.sqlite')
const walPath = `${dbPath}-wal`
const shmPath = `${dbPath}-shm`
const untouchedPath = path.join(tmp, 'secret-santa.sqlite')
const untouchedWalPath = `${untouchedPath}-wal`

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('ResetHelper', () => {
  it('удаляет только указанный SQLite-файл и его wal/shm', () => {
    for (const file of [dbPath, walPath, shmPath, untouchedPath, untouchedWalPath]) {
      fs.writeFileSync(file, 'test')
    }

    assert.deepEqual(resetBrowserDb(dbPath), [dbPath, walPath, shmPath])
    assert.equal(fs.existsSync(dbPath), false)
    assert.equal(fs.existsSync(walPath), false)
    assert.equal(fs.existsSync(shmPath), false)
    assert.equal(fs.existsSync(untouchedPath), true)
    assert.equal(fs.existsSync(untouchedWalPath), true)
  })

  it('не трогает основную и локальную БД', () => {
    assert.throws(() => resetBrowserDb(path.join(root, 'data', 'secret-santa.sqlite')), /основную|локальную/)
    assert.throws(() => resetBrowserDb(path.join(root, 'data', 'seed.sqlite')), /основную|локальную/)
  })
})
