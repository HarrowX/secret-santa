import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-santa-e2e-'))
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
  db.exec('DELETE FROM users; DELETE FROM games; DELETE FROM rate_limits;')
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

function createClient() {
  const cookies = new Map()

  function saveCookies(response) {
    const raw = response.headers.get('set-cookie')
    const items = response.headers.getSetCookie?.() ?? (raw ? [raw] : [])
    for (const item of items) {
      const [name, ...rest] = item.split(';')[0].trim().split('=')
      if (!name || !rest.length) continue
      if (!rest.join('=') || /Max-Age=0/i.test(item)) cookies.delete(name)
      else cookies.set(name, decodeURIComponent(rest.join('=')))
    }
  }

  return {
    async request(method, target, body, extraHeaders = {}) {
      const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
      const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method)
      const csrf = cookies.get('santa_csrf')
      const response = await fetch(`${base}${target}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(unsafe && csrf ? { 'x-csrf-token': csrf } : {}),
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      saveCookies(response)
      return {
        status: response.status,
        body: await response.json().catch(() => null),
      }
    },
  }
}

describe('E2E', () => {
  it('организатор проводит игру от создания до рассылки', async () => {
    const organizer = createClient()
    const invitee = createClient()

    const session = await organizer.request('POST', '/auth/session', {})
    assert.equal(session.status, 201)

    const created = await organizer.request('POST', '/games', {
      title: 'Е2E организатор',
      budget: '1 000 ₽',
      themeId: 'winter',
    })
    assert.equal(created.status, 201)
    const game = created.body

    const added = await organizer.request('POST', `/games/${game.token}/participants/bulk`, {
      names: 'Аня, Борис, Вика',
    })
    assert.equal(added.status, 201)
    assert.equal(added.body.added, 3)

    const question = await organizer.request('POST', `/games/${game.token}/questions`, {
      title: 'Хобби',
      required: true,
      position: 1,
    })
    assert.equal(question.status, 201)

    const invite = await organizer.request('GET', `/games/${game.token}/invite`)
    assert.equal(invite.status, 200)
    const anya = invite.body.participants.find((person) => person.name === 'Аня')
    assert.match(anya.url, /\/join\//)

    const inviteeSession = await invitee.request('POST', '/auth/session', {})
    assert.equal(inviteeSession.status, 201)
    const accepted = await invitee.request('POST', `/invites/${anya.invite_token}/accept`, {
      wishlist: 'Книги',
      address: 'Москва',
    })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.participant.user_id, inviteeSession.body.user.id)

    const answers = await invitee.request(
      'PUT',
      `/games/${game.token}/participants/${anya.id}/answers`,
      { answers: [{ questionId: question.body.id, value: 'Книги и настолки' }] },
      { 'x-invite-token': anya.invite_token },
    )
    assert.equal(answers.status, 200)

    const draw = await organizer.request('POST', `/games/${game.token}/draw`)
    assert.equal(draw.status, 200)
    assert.equal(draw.body.length, 3)

    const pairs = await organizer.request('GET', `/games/${game.token}/pairs`)
    assert.equal(pairs.status, 200)
    assert.equal(pairs.body.length, 3)

    const loaded = await organizer.request('GET', `/games/${game.token}`)
    assert.equal(loaded.status, 200)
    assert.equal(loaded.body.progress.joined, 33)
    assert.ok(loaded.body.progress.filled > 0)

    const events = await organizer.request('GET', `/games/${game.token}/events`)
    assert.ok(events.body.some((event) => event.kind === 'draw'))

    const reminder = await organizer.request('POST', `/games/${game.token}/reminders`, {
      recipientIds: [anya.id],
      body: 'Напоминаю о подарке',
    })
    assert.equal(reminder.status, 201)

    const reminders = await organizer.request('GET', `/games/${game.token}/reminders`)
    assert.equal(reminders.body.length, 1)

    const organizerInvite = await organizer.request('POST', `/games/${game.token}/organizers/invite`)
    assert.equal(organizerInvite.status, 201)
    assert.match(organizerInvite.body.url, /\/organizer\//)
  })

  it('участник заполняет анкету и видит пару после раскрытия', async () => {
    const organizer = createClient()
    const participant = createClient()

    const session = await organizer.request('POST', '/auth/session', {})
    assert.equal(session.status, 201)
    const created = await organizer.request('POST', '/games', {
      title: 'Е2E участник',
      themeId: 'sakura',
    })
    assert.equal(created.status, 201)
    const game = created.body

    const added = await organizer.request('POST', `/games/${game.token}/participants/bulk`, { names: 'Аня, Борис' })
    assert.equal(added.status, 201)

    const invite = await organizer.request('GET', `/games/${game.token}/invite`)
    const anya = invite.body.participants.find((person) => person.name === 'Аня')
    const boris = invite.body.participants.find((person) => person.name === 'Борис')
    await organizer.request('PATCH', `/games/${game.token}/participants/${boris.id}`, { wishlist: 'Пазлы' })

    const participantSession = await participant.request('POST', '/auth/session', {})
    assert.equal(participantSession.status, 201)
    const accepted = await participant.request('POST', `/invites/${anya.invite_token}/accept`, {
      email: 'anya@example.test',
      wishlist: 'Настолки',
      address: 'Казань',
    })
    assert.equal(accepted.status, 200)

    const myGames = await participant.request('GET', '/me/games')
    assert.equal(myGames.body.length, 1)
    assert.equal(myGames.body[0].role, 'participant')

    const beforeDraw = await participant.request('GET', '/me/exchanges')
    assert.equal(beforeDraw.body.length, 0)

    const draw = await organizer.request('POST', `/games/${game.token}/draw`)
    assert.equal(draw.status, 200)

    const hidden = await participant.request('GET', '/me/exchanges')
    assert.equal(hidden.body.length, 1)
    assert.equal(hidden.body[0].revealed_at, null)
    assert.equal(hidden.body[0].wishlist, null)
    assert.equal(hidden.body[0].address, null)

    const reveal = await organizer.request('POST', `/games/${game.token}/reveal`, { fromId: anya.id })
    assert.equal(reveal.status, 200)

    const revealed = await participant.request('GET', '/me/exchanges')
    assert.ok(revealed.body[0].revealed_at)
    assert.ok(revealed.body[0].receiver_name)
    assert.ok(revealed.body[0].wishlist)

    const sent = await organizer.request('POST', `/games/${game.token}/participants/${anya.id}/gift-sent`)
    const received = await organizer.request('POST', `/games/${game.token}/participants/${anya.id}/gift-received`)
    assert.equal(sent.status, 200)
    assert.equal(received.status, 200)

    const loaded = await organizer.request('GET', `/games/${game.token}`)
    const stored = loaded.body.participants.find((person) => person.id === anya.id)
    assert.ok(stored.gift_sent_at)
    assert.ok(stored.gift_received_at)
  })

  it('полный цикл игры проходит без регистрации и обязательного email', async () => {
    const organizer = createClient()
    const participant = createClient()

    const session = await organizer.request('POST', '/auth/session', {})
    assert.equal(session.status, 201)
    assert.equal(session.body.user.email, null)

    const created = await organizer.request('POST', '/games', { title: 'Анонимный цикл', themeId: 'winter' })
    assert.equal(created.status, 201)
    const game = created.body

    const added = await organizer.request('POST', `/games/${game.token}/participants/bulk`, {
      names: 'Аня, Борис, Вика',
    })
    assert.equal(added.status, 201)

    const question = await organizer.request('POST', `/games/${game.token}/questions`, {
      title: 'Хобби',
      required: true,
    })
    assert.equal(question.status, 201)

    const invite = await organizer.request('GET', `/games/${game.token}/invite`)
    const anna = invite.body.participants.find((person) => person.name === 'Аня')

    const accepted = await participant.request('POST', `/invites/${anna.invite_token}/accept`, {
      wishlist: 'Настолки',
    })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.participant.user_id, null)
    assert.equal(accepted.body.participant.email, null)

    const answers = await participant.request(
      'PUT',
      `/games/${game.token}/participants/${anna.id}/answers`,
      { answers: [{ questionId: question.body.id, value: 'Настолки' }] },
      { 'x-invite-token': anna.invite_token },
    )
    assert.equal(answers.status, 200)

    const draw = await organizer.request('POST', `/games/${game.token}/draw`)
    assert.equal(draw.status, 200)
    assert.equal(draw.body.length, 3)

    const reveal = await organizer.request('POST', `/games/${game.token}/reveal`, { fromId: anna.id })
    assert.equal(reveal.status, 200)

    const message = await participant.request(
      'POST',
      `/games/${game.token}/chat`,
      { body: 'Спасибо за игру!' },
      { 'x-invite-token': anna.invite_token },
    )
    assert.equal(message.status, 201)

    const sent = await organizer.request('POST', `/games/${game.token}/participants/${anna.id}/gift-sent`)
    assert.equal(sent.status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM users WHERE email IS NOT NULL').get().total, 0)
  })
})
