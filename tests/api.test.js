import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-santa-api-'))
let db
let createApp
let server
let base

before(async () => {
  process.env.DB_PATH = path.join(tmp, 'test.sqlite')
  process.env.DOMAIN = 'santa.local'
  process.env.NODE_ENV = 'test'
  ;({ createApp } = await import('../server/app.js'))
  ;({ db } = await import('../server/db.js'))
})

beforeEach(async () => {
  db.exec('DELETE FROM users; DELETE FROM games;')
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

async function request(method, target, body, headers = {}) {
  const response = await fetch(`${base}${target}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  return {
    status: response.status,
    body: payload,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null,
  }
}

function cookieHeader(response) {
  return response.cookie ? { Cookie: response.cookie } : {}
}

async function createGame(title = 'Тестовая игра') {
  const response = await request('POST', '/games', { title, themeId: 'winter' })
  assert.equal(response.status, 201)
  return response.body
}

async function addParticipants(gameId, names) {
  const people = []
  for (const name of names) {
    const response = await request('POST', `/games/${gameId}/participants`, { name })
    assert.equal(response.status, 201)
    people.push(response.body)
  }
  return people
}

describe('API', () => {
  it('отвечает health-check', async () => {
    const response = await request('GET', '/health')
    assert.equal(response.status, 200)
    assert.deepEqual(response.body, { status: 'ok' })
  })

  it('создаёт игру и возвращает её в списке', async () => {
    const game = await createGame('Зима')
    assert.equal(game.theme_id, 'winter')
    assert.ok(game.token)

    const list = await request('GET', '/games')
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].participants_count, 0)
  })

  it('возвращает ошибку валидации в едином формате', async () => {
    const response = await request('POST', '/games', { title: '   ' })
    assert.equal(response.status, 400)
    assert.ok(response.body.error.message)
  })

  it('распределяет круговые пары и сохраняет ручное назначение', async () => {
    const game = await createGame()
    const people = await addParticipants(game.id, ['Аня', 'Борис', 'Вера'])
    const drawn = await request('POST', `/games/${game.id}/draw`, {})
    assert.equal(drawn.status, 200)
    assert.equal(drawn.body.length, 3)
    assert.equal(new Set(drawn.body.map((pair) => pair.to_id)).size, 3)
    assert.ok(drawn.body.every((pair) => pair.from_id !== pair.to_id))

    const manual = await request('POST', `/games/${game.id}/pairs`, {
      fromId: people[0].id,
      toId: people[2].id,
    })
    assert.equal(manual.status, 200)
    assert.equal(new Set(manual.body.map((pair) => pair.to_id)).size, 3)
    assert.equal(manual.body.filter((pair) => pair.manual).length, 1)
  })

  it('учитывает исключения при жеребьёвке', async () => {
    const game = await createGame()
    const people = await addParticipants(game.id, ['Аня', 'Борис', 'Вера'])
    const exclusion = await request('POST', `/games/${game.id}/exclusions`, {
      fromId: people[0].id,
      toId: people[1].id,
    })
    assert.equal(exclusion.status, 201)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const drawn = await request('POST', `/games/${game.id}/draw`, {})
      assert.equal(drawn.status, 200)
      assert.ok(
        drawn.body.every(
          (pair) => !(pair.from_id === people[0].id && pair.to_id === people[1].id),
        ),
      )
    }
  })

  it('создаёт анонимную сессию, восстанавливает её и добавляет email', async () => {
    const created = await request('POST', '/auth/session', {})
    assert.equal(created.status, 201)
    assert.equal(created.body.recoveryCodes.length, 5)
    assert.equal(created.body.user.email, null)
    assert.ok(created.cookie)

    const current = await request('GET', '/auth/session', undefined, cookieHeader(created))
    assert.equal(current.body.user.id, created.body.user.id)

    const email = await request(
      'PATCH',
      '/auth/email',
      { email: 'santa@example.com' },
      cookieHeader(created),
    )
    assert.equal(email.status, 200)
    assert.equal(email.body.user.email, 'santa@example.com')

    const recovered = await request('POST', '/auth/recovery', {
      code: created.body.recoveryCodes[0],
    })
    assert.equal(recovered.status, 200)
    assert.equal(recovered.body.user.id, created.body.user.id)
    assert.equal(recovered.body.recoveryCodes.length, 5)

    const reused = await request('POST', '/auth/recovery', {
      code: created.body.recoveryCodes[0],
    })
    assert.equal(reused.status, 400)

    const logout = await request('POST', '/auth/logout', {}, cookieHeader(created))
    assert.equal(logout.status, 200)
    const afterLogout = await request('GET', '/auth/session', undefined, cookieHeader(created))
    assert.equal(afterLogout.body.user, null)
  })

  it('управляет вопросами, сообщениями, организаторами и поддоменами', async () => {
    const game = await createGame()
    const people = await addParticipants(game.id, ['Аня', 'Борис'])
    const session = await request('POST', '/auth/session', {})

    const question = await request('POST', `/games/${game.id}/questions`, {
      title: 'Что подарить?',
      type: 'single',
      required: true,
    })
    assert.equal(question.status, 201)
    const updated = await request('PATCH', `/games/${game.id}/questions/${question.body.id}`, {
      title: 'Идея подарка',
    })
    assert.equal(updated.body.title, 'Идея подарка')
    const deleted = await request('DELETE', `/games/${game.id}/questions/${question.body.id}`)
    assert.equal(deleted.status, 200)

    const message = await request('POST', `/games/${game.id}/messages`, {
      body: 'Напоминание',
      toId: people[1].id,
    })
    assert.equal(message.status, 201)
    const messages = await request('GET', `/games/${game.id}/messages`)
    assert.equal(messages.body.length, 1)

    const organizer = await request('POST', `/games/${game.id}/organizers`, {
      token: session.body.user.token,
    })
    assert.equal(organizer.status, 201)
    const organizers = await request('GET', `/games/${game.id}/organizers`)
    assert.equal(organizers.body.length, 2)

    const tenant = await request('POST', '/tenants', {
      slug: 'company',
      gameId: game.id,
      domain: 'santa.local',
    })
    assert.equal(tenant.status, 201)
    const resolved = await request('GET', '/tenants/company')
    assert.equal(resolved.body.game.title, game.title)
    const current = await request('GET', '/tenants/current')
    assert.equal(current.body.tenant, null)
  })

  it('ограничивает частоту запросов к auth', async () => {
    const statuses = []
    for (let index = 0; index < 21; index += 1) {
      const response = await request('POST', '/auth/session', {})
      statuses.push(response.status)
    }
    assert.equal(statuses.filter((status) => status === 201).length, 20)
    assert.equal(statuses.at(-1), 429)
  })
})
