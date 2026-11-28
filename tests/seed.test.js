import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { seedLocal } from '../scripts/seed-local.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-santa-seed-'))
const dbPath = path.join(tmp, 'seed.sqlite')
const env = { ...process.env, NODE_ENV: 'test' }

function count(database, table) {
  return database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total
}

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('local seed', () => {
  it('создаёт игровые данные и не создаёт учётные данные', () => {
    const result = seedLocal({ dbPath, env })

    const database = new Database(dbPath, { readonly: true })
    try {
      assert.equal(count(database, 'games'), 1)
      const game = database.prepare('SELECT * FROM games').get()
      assert.equal(game.token, result.gameToken)
      assert.match(game.title, /локаль/i)

      assert.equal(count(database, 'participants'), 4)
      assert.deepEqual(
        database
          .prepare('SELECT name FROM participants ORDER BY id')
          .all()
          .map((row) => row.name),
        ['Аня', 'Борис', 'Вика', 'Дима'],
      )
      assert.equal(
        database.prepare('SELECT COUNT(*) AS total FROM participants WHERE invite_token = ?').get(result.inviteToken)
          .total,
        1,
      )

      assert.equal(count(database, 'questions'), 3)
      assert.deepEqual(
        database
          .prepare('SELECT type FROM questions ORDER BY position')
          .all()
          .map((row) => row.type),
        ['text', 'boolean', 'single'],
      )
      assert.equal(count(database, 'answers'), 12)

      assert.equal(count(database, 'pairs'), 4)
      assert.equal(database.prepare('SELECT COUNT(*) AS total FROM pairs WHERE revealed_at IS NOT NULL').get().total, 4)
      assert.equal(count(database, 'chat_messages'), 4)
      assert.ok(count(database, 'events') >= 5)

      assert.equal(count(database, 'users'), 0)
      assert.equal(count(database, 'sessions'), 0)
      assert.equal(count(database, 'recovery_codes'), 0)
      assert.equal(
        database.prepare('SELECT COUNT(*) AS total FROM participants WHERE email IS NOT NULL').get().total,
        0,
      )
    } finally {
      database.close()
    }
  })

  it('запрещает основную БД и production-окружение', () => {
    assert.throws(
      () => seedLocal({ dbPath: path.join(root, 'data', 'secret-santa.sqlite'), env }),
      /secret-santa\.sqlite/,
    )
    assert.throws(() => seedLocal({ dbPath, env: { ...env, NODE_ENV: 'production' } }), /production/)
  })
})
