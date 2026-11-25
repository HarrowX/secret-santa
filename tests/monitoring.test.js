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
let isMonitoringRunning
let latestChecks
let recordError
let recentErrors
let server
let base

before(async () => {
  process.env.DB_PATH = path.join(tmp, 'test.sqlite')
  process.env.DOMAIN = 'santa.local'
  process.env.NODE_ENV = 'test'
  process.env.MONITORING_TOKEN = 'monitor-secret'
  ;({ createApp } = await import('../server/app.js'))
  ;({ db } = await import('../server/db.js'))
  ;({ checkSubdomains, isMonitoringRunning, latestChecks, recordError, recentErrors } =
    await import('../server/services/monitoring.js'))
})

beforeEach(async () => {
  db.exec('DELETE FROM monitoring_checks; DELETE FROM monitoring_errors; DELETE FROM tenants; DELETE FROM games;')
  delete process.env.MONITORING_WEBHOOK_URL
  delete process.env.MONITORING_KEEP_CHECKS
  delete process.env.MONITORING_KEEP_ERRORS
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

function okFetcher(url) {
  return { ok: true, status: 200, url }
}

describe('Мониторинг', () => {
  it('проверяет апекс и поддомены, сохраняя результаты в БД', async () => {
    addTenant('company')
    addTenant('team')
    const calls = []

    const results = await checkSubdomains({
      fetcher: async (url) => {
        calls.push(url)
        return url.includes('company') ? { ok: false, status: 503 } : okFetcher(url)
      },
    })

    assert.deepEqual(calls.sort(), [
      'https://company.santa.local/api/health',
      'https://santa.local/api/health',
      'https://team.santa.local/api/health',
    ])
    assert.equal(results.length, 3)
    assert.ok(results.some((item) => item.host === 'company.santa.local' && !item.ok && item.error === 'HTTP 503'))
    assert.ok(results.some((item) => item.host === 'santa.local' && item.ok))
    assert.equal(latestChecks().length, 3)
    assert.ok(recentErrors().some((item) => item.host === 'company.santa.local'))
  })

  it('отдаёт ошибки и проверки только по токену мониторинга, не раскрывая токен', async () => {
    recordError({ type: 'test', name: 'TestError' })
    addTenant('company')
    await checkSubdomains({ fetcher: okFetcher })

    const denied = await fetch(`${base}/monitoring`)
    assert.equal(denied.status, 401)

    const wrongToken = await fetch(`${base}/monitoring`, { headers: { 'x-monitoring-token': 'wrong' } })
    assert.equal(wrongToken.status, 401)

    const allowed = await fetch(`${base}/monitoring`, { headers: { 'x-monitoring-token': 'monitor-secret' } })
    assert.equal(allowed.status, 200)
    const payload = await allowed.json()
    assert.ok(payload.errors.some((item) => item.name === 'TestError'))
    assert.ok(payload.checks.some((item) => item.host === 'company.santa.local' && item.ok === 1))
    assert.ok(!JSON.stringify(payload).includes('monitor-secret'))
  })

  it('ротирует старые проверки и ошибки', async () => {
    process.env.MONITORING_KEEP_CHECKS = '3'
    process.env.MONITORING_KEEP_ERRORS = '2'
    addTenant('company')
    recordError({ type: 'test', name: 'OldError' })

    await checkSubdomains({ fetcher: okFetcher })
    await checkSubdomains({ fetcher: okFetcher })

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM monitoring_checks').get().total, 3)
    assert.equal(latestChecks().length, 2)
    assert.ok(recentErrors(100).length <= 2)
  })

  it('не допускает параллельных проверок', async () => {
    addTenant('company')
    const slowFetcher = async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return okFetcher(url)
    }

    const first = checkSubdomains({ fetcher: slowFetcher })
    const second = checkSubdomains({ fetcher: slowFetcher })
    assert.equal(isMonitoringRunning(), true)

    const [firstResults, secondResults] = await Promise.all([first, second])
    assert.equal(firstResults.length, 2)
    assert.deepEqual(secondResults, [])
    assert.equal(isMonitoringRunning(), false)
  })

  it('отправляет webhook при недоступном домене и не раскрывает токен', async () => {
    process.env.MONITORING_WEBHOOK_URL = 'https://alerts.example.test/hook'
    const alerts = []
    const webhookFetcher = async (url, options) => {
      alerts.push({ url, body: JSON.parse(options.body) })
      return { ok: true, status: 200 }
    }

    await checkSubdomains({
      fetcher: async (url) => (url === 'https://santa.local/api/health' ? { ok: false, status: 503 } : okFetcher(url)),
      webhookFetcher,
    })

    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].url, 'https://alerts.example.test/hook')
    assert.ok(alerts[0].body.failed.some((item) => item.host === 'santa.local' && item.status === 503))
    assert.ok(!JSON.stringify(alerts[0].body).includes('monitor-secret'))
  })

  it('держит /api/health живым и отдаёт глубокую проверку', async () => {
    const response = await fetch(`${base}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })

    const deep = await fetch(`${base}/health?deep=1`)
    assert.equal(deep.status, 200)
    const payload = await deep.json()
    assert.equal(payload.status, 'ok')
    assert.equal(payload.database, 'ok')
    assert.ok(payload.checkedAt)
  })
})
