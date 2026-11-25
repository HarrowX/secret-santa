import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-santa-monitoring-'))
let db
let createApp
let checkSubdomains
let latestChecks
let recordError
let server
let base

before(async () => {
  process.env.DB_PATH = path.join(tmp, 'test.sqlite')
  process.env.DOMAIN = 'santa.local'
  process.env.NODE_ENV = 'test'
  process.env.MONITORING_TOKEN = 'monitor-secret'
  ;({ createApp } = await import('../server/app.js'))
  ;({ db } = await import('../server/db.js'))
  ;({ checkSubdomains, latestChecks, recordError } = await import('../server/services/monitoring.js'))
})

beforeEach(async () => {
  db.exec('DELETE FROM monitoring_checks; DELETE FROM tenants; DELETE FROM games;')
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}/api`
})

afterEach(async () => {
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
})

after(() => {
  db.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

function addTenant(slug) {
  const gameId = Number(
    db.prepare('INSERT INTO games (token, title) VALUES (?, ?)').run(randomUUID(), `Игра ${slug}`).lastInsertRowid,
  )
  db.prepare('INSERT INTO tenants (slug, game_id, domain) VALUES (?, ?, ?)').run(slug, gameId, 'santa.local')
}

describe('Мониторинг', () => {
  it('проверяет доступность поддоменов и сохраняет результаты', async () => {
    addTenant('company')
    addTenant('team')
    const calls = []

    const results = await checkSubdomains({
      fetcher: async (url) => {
        calls.push(url)
        return url.includes('company') ? { ok: false, status: 503 } : { ok: true, status: 200 }
      },
    })

    assert.deepEqual(calls.sort(), ['https://company.santa.local/api/health', 'https://team.santa.local/api/health'])
    assert.equal(results.length, 2)
    assert.ok(results.some((item) => item.host === 'company.santa.local' && !item.ok && item.error === 'HTTP 503'))
    assert.ok(results.some((item) => item.host === 'team.santa.local' && item.ok))
    assert.equal(latestChecks().length, 2)
  })

  it('отдаёт ошибки и проверки только по токену мониторинга', async () => {
    recordError({ type: 'test', name: 'TestError' })
    addTenant('company')
    await checkSubdomains({ fetcher: async () => ({ ok: true, status: 200 }) })

    const denied = await fetch(`${base}/monitoring`)
    assert.equal(denied.status, 401)

    const allowed = await fetch(`${base}/monitoring`, { headers: { 'x-monitoring-token': 'monitor-secret' } })
    assert.equal(allowed.status, 200)
    const payload = await allowed.json()
    assert.ok(payload.errors.some((item) => item.name === 'TestError'))
    assert.ok(payload.checks.some((item) => item.host === 'company.santa.local' && item.ok === 1))
  })
})
