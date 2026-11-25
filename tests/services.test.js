import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-santa-service-'))
let db
let drawPairs
let resolveTenant

before(async () => {
  process.env.DB_PATH = path.join(tmp, 'test.sqlite')
  process.env.DOMAIN = 'santa.local'
  ;({ db } = await import('../server/db.js'))
  ;({ drawPairs } = await import('../server/services/draw.js'))
  ;({ resolveTenant } = await import('../server/services/tenants.js'))
})

after(() => {
  db.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('drawPairs', () => {
  const ids = [1, 2, 3, 4]

  it('строит круговое распределение без самоназначений', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pairs = drawPairs({ ids })
      assert.equal(pairs.size, 4)
      assert.equal(new Set(pairs.values()).size, 4)
      assert.ok([...pairs].every(([from, to]) => from !== to))
    }
  })

  it('работает с нечётным числом участников', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pairs = drawPairs({ ids: [1, 2, 3] })
      assert.equal(pairs.size, 3)
      assert.equal(new Set(pairs.values()).size, 3)
      assert.ok([...pairs].every(([from, to]) => from !== to))
    }
  })

  it('учитывает исключения', () => {
    const exclusions = new Set(['1:2', '2:3'])
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pairs = drawPairs({ ids, exclusions })
      assert.notEqual(pairs.get(1), 2)
      assert.notEqual(pairs.get(2), 3)
    }
  })

  it('сохраняет ручные назначения', () => {
    const manual = new Map([[1, 3]])
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pairs = drawPairs({ ids, manual })
      assert.equal(pairs.get(1), 3)
    }
  })

  it('возвращает null для невозможных ограничений', () => {
    const pairs = drawPairs({ ids: [1, 2], exclusions: new Set(['1:2', '2:1']) })
    assert.equal(pairs, null)
  })
})

describe('resolveTenant', () => {
  before(() => {
    const result = db
      .prepare('INSERT INTO games (token, title, theme_id) VALUES (?, ?, ?)')
      .run('test-token', 'Игра', 'winter')
    db.prepare('INSERT INTO tenants (slug, game_id, domain) VALUES (?, ?, ?)').run(
      'company',
      Number(result.lastInsertRowid),
      'santa.local',
    )
  })

  it('находит игру по поддомену', () => {
    const tenant = resolveTenant('company.santa.local', 'santa.local')
    assert.equal(tenant.slug, 'company')
    assert.equal(tenant.game.title, 'Игра')
  })

  it('игнорирует порт и протокол', () => {
    assert.equal(resolveTenant('company.santa.local:5173', 'santa.local').slug, 'company')
    assert.equal(resolveTenant('company.santa.local', 'http://santa.local:3000').slug, 'company')
  })

  it('возвращает null для основного домена и неизвестных поддоменов', () => {
    assert.equal(resolveTenant('santa.local', 'santa.local'), null)
    assert.equal(resolveTenant('www.santa.local', 'santa.local'), null)
    assert.equal(resolveTenant('other.santa.local', 'santa.local'), null)
    assert.equal(resolveTenant('company.example.com', 'santa.local'), null)
  })
})
