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
const cookies = new Map()

before(async () => {
  process.env.DB_PATH = path.join(tmp, 'test.sqlite')
  process.env.DOMAIN = 'santa.local'
  process.env.NODE_ENV = 'test'
  ;({ createApp } = await import('../server/app.js'))
  ;({ db } = await import('../server/db.js'))
})

beforeEach(async () => {
  db.exec('DELETE FROM users; DELETE FROM games; DELETE FROM rate_limits;')
  cookies.clear()
  anonymousCsrf = null
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

function parseCookies(header) {
  const parsed = new Map()
  for (const part of String(header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name && rest.length) parsed.set(name, decodeURIComponent(rest.join('=')))
  }
  return parsed
}

let anonymousCsrf = null

function mergedCookies(headers) {
  const merged = new Map(cookies)
  for (const [name, value] of parseCookies(headers.Cookie ?? headers.cookie)) merged.set(name, value)
  if (anonymousCsrf && !merged.has('santa_csrf')) merged.set('santa_csrf', anonymousCsrf)
  return merged
}

function saveCookies(response, noCookies = false) {
  const items = response.headers.getSetCookie?.() ?? []
  for (const item of items) {
    const [name, ...rest] = item.split(';')[0].trim().split('=')
    if (!name || !rest.length) continue
    const value = decodeURIComponent(rest.join('='))
    if (name === 'santa_csrf' && value) anonymousCsrf = value
    if (noCookies) continue
    if (!value || /Max-Age=0/i.test(item)) cookies.delete(name)
    else cookies.set(name, value)
  }
}

async function request(method, target, body, headers = {}) {
  const noCookies = headers['x-test-no-cookies'] === true
  const merged = noCookies ? new Map() : mergedCookies(headers)
  if (noCookies && anonymousCsrf) merged.set('santa_csrf', anonymousCsrf)
  const cookie = [...merged].map(([name, value]) => `${name}=${value}`).join('; ')
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  const { Cookie: _upperCookie, cookie: _lowerCookie, 'x-test-no-cookies': _noCookies, ...restHeaders } = headers
  const response = await fetch(`${base}${target}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(unsafe && merged.get('santa_csrf') ? { 'x-csrf-token': merged.get('santa_csrf') } : {}),
      ...restHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  saveCookies(response, noCookies)
  const payload = await response.json().catch(() => null)
  const sessionCookie = (response.headers.getSetCookie?.() ?? []).find((item) => item.startsWith('santa_session='))
  return {
    status: response.status,
    body: payload,
    cookie: sessionCookie?.split(';')[0] ?? null,
  }
}

function cookieHeader(response) {
  return response.cookie ? { Cookie: response.cookie } : {}
}

async function createGame(title = 'Тестовая игра', headers = {}) {
  const merged = mergedCookies(headers)
  let authHeaders = headers
  if (!merged.get('santa_session') && headers['x-test-no-cookies'] !== true) {
    const session = await request('POST', '/auth/session', {})
    authHeaders = { ...headers, ...cookieHeader(session) }
  }
  const response = await request('POST', '/games', { title, themeId: 'winter' }, authHeaders)
  assert.equal(response.status, 201)
  return response.body
}

async function addParticipants(gameId, names, headers = {}) {
  const people = []
  for (const name of names) {
    const response = await request('POST', `/games/${gameId}/participants`, { name }, headers)
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

  it('отдаёт все темы оформления из базы', async () => {
    const response = await request('GET', '/themes')
    assert.equal(response.status, 200)
    assert.equal(response.body.length, 10)
    assert.deepEqual(
      response.body.map((theme) => theme.id),
      ['winter', 'halloween', 'alpine', 'egypt', 'pixel', 'sakura', 'space', 'cyberpunk', 'valley', 'tropical'],
    )
    assert.ok(response.body.every((theme) => theme.glow))
  })

  it('создаёт игру и возвращает её в списке только авторизованному владельцу', async () => {
    const owner = await request('POST', '/auth/session', {})
    const headers = cookieHeader(owner)
    const game = await createGame('Зима', headers)
    assert.equal(game.theme_id, 'winter')
    assert.match(game.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    const byToken = await request('GET', `/games/${game.token}`, undefined, headers)
    assert.equal(byToken.status, 200)
    assert.equal(byToken.body.game.id, game.id)

    const list = await request('GET', '/games', undefined, headers)
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].participants_count, 0)
    assert.equal('token' in list.body[0], false)

    const unauthorized = await request('GET', '/games', undefined, { 'x-test-no-cookies': true })
    assert.equal(unauthorized.status, 401)
  })

  it('сохраняет название, бюджет, дату, правила и тему игры', async () => {
    const owner = await request('POST', '/auth/session', {})
    const headers = cookieHeader(owner)
    const response = await request(
      'POST',
      '/games',
      {
        title: 'Подробная игра',
        budget: '1 500 ₽',
        exchangeDate: '2026-12-25',
        rules: 'Без алкоголя',
        themeId: 'space',
      },
      headers,
    )
    assert.equal(response.status, 201)
    assert.equal(response.body.budget, '1 500 ₽')
    assert.equal(response.body.exchange_date, '2026-12-25')
    assert.equal(response.body.rules, 'Без алкоголя')
    assert.equal(response.body.theme_id, 'space')

    const loaded = await request('GET', `/games/${response.body.token}`, undefined, headers)
    assert.equal(loaded.status, 200)
    assert.equal(loaded.body.game.title, 'Подробная игра')
    assert.equal(loaded.body.game.rules, 'Без алкоголя')
  })

  it('возвращает ошибку валидации в едином формате', async () => {
    const response = await request('POST', '/games', { title: '   ' })
    assert.equal(response.status, 400)
    assert.ok(response.body.error.message)
  })

  it('сохраняет карточку участника и привязывает её к пользователю', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Карточка', cookieHeader(owner))
    const [person] = await addParticipants(game.token, ['Вика'], cookieHeader(owner))
    const session = await request('POST', '/auth/session', {})

    const patched = await request(
      'PATCH',
      `/games/${game.token}/participants/${person.id}`,
      {
        name: 'Виктория',
        email: 'vika@example.test',
        wishlist: 'Книги',
        address: 'Москва',
        notes: 'Только не сладости',
        preferred: 'Аня',
      },
      cookieHeader(owner),
    )
    assert.equal(patched.status, 200)
    assert.equal(patched.body.wishlist, 'Книги')
    assert.equal(patched.body.preferred, 'Аня')

    const invite = await request('GET', `/games/${game.token}/invite`, undefined, cookieHeader(owner))
    const token = invite.body.participants[0].invite_token
    const accepted = await request(
      'POST',
      `/invites/${token}/accept`,
      { wishlist: 'Книги и настолки', address: 'Москва' },
      cookieHeader(session),
    )
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.participant.user_id, session.body.user.id)
    assert.equal(accepted.body.participant.wishlist, 'Книги и настолки')
    assert.equal(accepted.body.participant.notes, 'Только не сладости')
    assert.equal(accepted.body.participant.filled, 1)

    const notifications = await request('GET', `/games/${game.token}/notifications`, undefined, {
      'x-invite-token': token,
      'x-test-no-cookies': true,
    })
    assert.ok(notifications.body.length >= 1)
    assert.ok(notifications.body.some((item) => item.kind === 'card_updated'))
    assert.ok(notifications.body.some((item) => JSON.parse(item.payload).text === 'Карточка участника обновлена'))
  })

  it('добавляет участников списком и обрабатывает персональные приглашения', async () => {
    const game = await createGame('Приглашения')
    const bulk = await request('POST', `/games/${game.token}/participants/bulk`, {
      names: 'Аня, Борис, Аня,\nВика',
    })
    assert.equal(bulk.status, 201)
    assert.equal(bulk.body.added, 3)

    const invite = await request('GET', `/games/${game.token}/invite`)
    assert.equal(invite.status, 200)
    assert.ok(invite.body.commonUrl.endsWith(`/game/${game.token}`))
    assert.equal(invite.body.participants.length, 3)
    assert.ok(invite.body.participants.every((person) => person.url.includes('/join/')))

    const person = invite.body.participants.find((item) => item.name === 'Аня')
    const opened = await request('GET', `/invites/${person.invite_token}`)
    assert.equal(opened.status, 200)
    assert.equal(opened.body.participant.name, 'Аня')
    assert.equal(opened.body.game.id, game.id)
    assert.equal(opened.body.game.token, game.token)

    const accepted = await request('POST', `/invites/${person.invite_token}/accept`, {
      email: 'anya@example.test',
    })
    assert.equal(accepted.status, 200)
    const updated = await request('GET', `/games/${game.token}`)
    const stored = updated.body.participants.find((item) => item.id === person.id)
    assert.equal(stored.email, 'anya@example.test')
    assert.equal(stored.filled, 1)

    const patched = await request('PATCH', `/games/${game.token}/participants/${person.id}`, {
      name: 'Анна',
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.body.name, 'Анна')

    const empty = await request('POST', `/games/${game.token}/participants/bulk`, { names: '   ' })
    assert.equal(empty.status, 400)
  })

  it('позволяет участникам самим присоединяться по общей ссылке и удаляет их по решению организатора', async () => {
    const game = await createGame('Самоприсоединение')
    const forbidden = await request(
      'POST',
      `/games/${game.token}/join`,
      { name: 'Без ссылки' },
      { 'x-test-no-cookies': true },
    )
    assert.equal(forbidden.status, 403)

    const joined = await request(
      'POST',
      `/games/${game.token}/join`,
      { name: 'Аня' },
      { 'x-game-token': game.token, 'x-test-no-cookies': true },
    )
    assert.equal(joined.status, 201)
    assert.equal(joined.body.participant.name, 'Аня')
    assert.ok(joined.body.inviteToken)
    assert.ok(joined.body.url.endsWith(`/join/${joined.body.inviteToken}`))

    const opened = await request('GET', `/invites/${joined.body.inviteToken}`, undefined, {
      'x-test-no-cookies': true,
    })
    assert.equal(opened.status, 200)
    assert.equal(opened.body.participant.id, joined.body.participant.id)

    const duplicate = await request(
      'POST',
      `/games/${game.token}/join`,
      { name: 'аня' },
      { 'x-game-token': game.token, 'x-test-no-cookies': true },
    )
    assert.equal(duplicate.status, 409)

    const invite = await request('GET', `/games/${game.token}/invite`)
    assert.equal(invite.status, 200)
    assert.ok(invite.body.commonUrl.endsWith(`/game/${game.token}`))
    assert.ok(invite.body.participants.some((person) => person.id === joined.body.participant.id))

    const removed = await request('DELETE', `/games/${game.token}/participants/${joined.body.participant.id}`)
    assert.equal(removed.status, 200)
    const afterRemoval = await request('GET', `/games/${game.token}`)
    assert.ok(!afterRemoval.body.participants.some((person) => person.id === joined.body.participant.id))
  })

  it('добавляет участников после жеребьёвки и распределяет только новых', async () => {
    const game = await createGame('Новые участники')
    const [first, second] = await addParticipants(game.token, ['Аня', 'Борис'])
    const initial = await request('POST', `/games/${game.token}/draw`)
    assert.equal(initial.status, 200)

    const [third, fourth] = await addParticipants(game.token, ['Вика', 'Гена'])
    const extra = await request('POST', `/games/${game.token}/draw/new`)
    assert.equal(extra.status, 200)
    assert.equal(extra.body.length, 4)
    assert.ok(
      extra.body.some((pair) => pair.from_id === first.id && pair.to_id === second.id) ||
        extra.body.some((pair) => pair.from_id === second.id && pair.to_id === first.id),
    )
    const newPairs = extra.body.filter((pair) => [third.id, fourth.id].includes(pair.from_id))
    assert.equal(newPairs.length, 2)
    assert.ok(newPairs.some((pair) => pair.to_id === third.id))
    assert.ok(newPairs.some((pair) => pair.to_id === fourth.id))

    const namedPairs = await request('GET', `/games/${game.token}/pairs`)
    assert.ok(namedPairs.body.every((pair) => pair.from_name && pair.to_name))

    const repeated = await request('POST', `/games/${game.token}/draw/new`)
    assert.equal(repeated.status, 400)
  })

  it('управляет исключениями и ручными парами при повторной жеребьёвке', async () => {
    const game = await createGame('Управление парами')
    const [first, second, third] = await addParticipants(game.token, ['Аня', 'Борис', 'Вика'])

    const exclusion = await request('POST', `/games/${game.token}/exclusions`, {
      fromId: first.id,
      toId: second.id,
    })
    assert.equal(exclusion.status, 201)
    const loaded = await request('GET', `/games/${game.token}`)
    assert.equal(loaded.body.exclusions.length, 1)

    const manual = await request('POST', `/games/${game.token}/pairs`, {
      fromId: first.id,
      toId: third.id,
    })
    assert.equal(manual.status, 200)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const draw = await request('POST', `/games/${game.token}/draw`)
      assert.equal(draw.status, 200)
      const pair = draw.body.find((item) => item.from_id === first.id)
      assert.equal(pair.to_id, third.id)
      assert.equal(pair.manual, 1)
    }

    const removed = await request('DELETE', `/games/${game.token}/exclusions/${first.id}/${second.id}`)
    assert.equal(removed.status, 200)
    const reset = await request('POST', `/games/${game.token}/pairs/reset`)
    assert.equal(reset.status, 200)
    const pairs = await request('GET', `/games/${game.token}/pairs`)
    assert.equal(pairs.body.length, 0)
  })

  it('распределяет круговые пары и сохраняет ручное назначение', async () => {
    const game = await createGame()
    const people = await addParticipants(game.token, ['Аня', 'Борис', 'Вера'])
    const drawn = await request('POST', `/games/${game.token}/draw`, {})
    assert.equal(drawn.status, 200)
    assert.equal(drawn.body.length, 3)
    assert.equal(new Set(drawn.body.map((pair) => pair.to_id)).size, 3)
    assert.ok(drawn.body.every((pair) => pair.from_id !== pair.to_id))

    const manual = await request('POST', `/games/${game.token}/pairs`, {
      fromId: people[0].id,
      toId: people[2].id,
    })
    assert.equal(manual.status, 200)
    assert.equal(new Set(manual.body.map((pair) => pair.to_id)).size, 3)
    assert.ok(manual.body.some((pair) => pair.manual))
  })

  it('учитывает исключения при жеребьёвке', async () => {
    const game = await createGame()
    const people = await addParticipants(game.token, ['Аня', 'Борис', 'Вера'])
    const exclusion = await request('POST', `/games/${game.token}/exclusions`, {
      fromId: people[0].id,
      toId: people[1].id,
    })
    assert.equal(exclusion.status, 201)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const drawn = await request('POST', `/games/${game.token}/draw`, {})
      assert.equal(drawn.status, 200)
      assert.ok(drawn.body.every((pair) => !(pair.from_id === people[0].id && pair.to_id === people[1].id)))
    }
  })

  it('регистрирует пользователя по email и паролю и позволяет войти', async () => {
    const anonymous = await request('POST', '/auth/session', {})
    const registered = await request(
      'POST',
      '/auth/register',
      { email: 'santa@example.com', password: 'secret123' },
      cookieHeader(anonymous),
    )
    assert.equal(registered.status, 200)
    assert.equal(registered.body.user.id, anonymous.body.user.id)
    assert.equal(registered.body.user.email, 'santa@example.com')
    assert.equal(registered.body.user.has_password, true)

    const duplicate = await request('POST', '/auth/register', {
      email: 'santa@example.com',
      password: 'secret123',
    })
    assert.equal(duplicate.status, 409)

    await request('POST', '/auth/logout', {}, cookieHeader(registered))
    const afterLogout = await request('GET', '/auth/session', undefined, cookieHeader(registered))
    assert.equal(afterLogout.body.user, null)

    const wrong = await request('POST', '/auth/login', {
      email: 'santa@example.com',
      password: 'wrongpass',
    })
    assert.equal(wrong.status, 401)

    const loggedIn = await request('POST', '/auth/login', {
      email: 'santa@example.com',
      password: 'secret123',
    })
    assert.equal(loggedIn.status, 200)
    assert.equal(loggedIn.body.user.id, registered.body.user.id)
  })

  it('создаёт анонимную сессию, восстанавливает её и добавляет email', async () => {
    const created = await request('POST', '/auth/session', {})
    assert.equal(created.status, 201)
    assert.equal(created.body.recoveryCodes.length, 5)
    assert.equal(created.body.user.email, null)
    assert.ok(created.cookie)

    const current = await request('GET', '/auth/session', undefined, cookieHeader(created))
    assert.equal(current.body.user.id, created.body.user.id)

    const email = await request('PATCH', '/auth/email', { email: 'santa@example.com' }, cookieHeader(created))
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

  it('показывает пользователю его игры и скрывает чувствительные данные обмена до раскрытия', async () => {
    const owner = await request('POST', '/auth/session', {})
    const session = await request('POST', '/auth/session', {})
    const headers = cookieHeader(session)
    const game = await createGame('Мой кабинет', cookieHeader(owner))
    const [person] = await addParticipants(game.token, ['Аня', 'Борис'], cookieHeader(owner))
    const invite = await request('GET', `/games/${game.token}/invite`, undefined, cookieHeader(owner))
    const token = invite.body.participants[0].invite_token
    const accepted = await request(
      'POST',
      `/invites/${token}/accept`,
      { wishlist: 'Книги', address: 'Москва' },
      headers,
    )
    assert.equal(accepted.body.participant.user_id, session.body.user.id)

    const receiverSession = await request('POST', '/auth/session', {})
    const receiverHeaders = cookieHeader(receiverSession)
    const receiverToken = invite.body.participants[1].invite_token
    const receiverAccepted = await request('POST', `/invites/${receiverToken}/accept`, {}, receiverHeaders)
    assert.equal(receiverAccepted.status, 200)

    await request('POST', `/games/${game.token}/draw`, undefined, cookieHeader(owner))

    const inviteHeaders = { ...headers, 'x-invite-token': token }
    const receiverInviteHeaders = { ...receiverHeaders, 'x-invite-token': receiverToken }
    const hiddenAnswers = await request('GET', `/games/${game.token}/recipient-answers`, undefined, inviteHeaders)
    assert.equal(hiddenAnswers.status, 403)
    const hiddenPair = await request('GET', `/games/${game.token}/my-pair`, undefined, receiverInviteHeaders)
    assert.equal(hiddenPair.status, 200)
    assert.equal(hiddenPair.body.revealed_at, null)
    assert.ok(!('from_name' in hiddenPair.body))

    const hidden = await request('GET', '/me/exchanges', undefined, headers)
    assert.equal(hidden.status, 200)
    assert.equal(hidden.body.length, 1)
    assert.equal(hidden.body[0].receiver_id, null)
    assert.equal(hidden.body[0].receiver_name, null)
    assert.equal(hidden.body[0].wishlist, null)
    assert.equal(hidden.body[0].address, null)
    assert.equal(hidden.body[0].notes, null)
    assert.equal(hidden.body[0].preferred, null)

    await request('POST', `/games/${game.token}/reveal`, { fromId: person.id }, cookieHeader(owner))

    const myGames = await request('GET', '/me/games', undefined, headers)
    assert.equal(myGames.status, 200)
    assert.equal(myGames.body.length, 1)
    assert.equal(myGames.body[0].title, 'Мой кабинет')
    assert.equal(myGames.body[0].token, game.token)
    assert.equal(myGames.body[0].role, 'participant')

    const exchanges = await request('GET', '/me/exchanges', undefined, headers)
    assert.equal(exchanges.status, 200)
    assert.equal(exchanges.body.length, 1)
    assert.equal(exchanges.body[0].receiver_name, 'Борис')
    assert.ok(exchanges.body[0].revealed_at)

    const recipient = await request('GET', `/games/${game.token}/recipient-answers`, undefined, inviteHeaders)
    assert.equal(recipient.status, 200)
    assert.equal(recipient.body.participant.name, 'Борис')
    assert.ok(Array.isArray(recipient.body.answers))

    const revealedPair = await request('GET', `/games/${game.token}/my-pair`, undefined, receiverInviteHeaders)
    assert.equal(revealedPair.status, 200)
    assert.equal(revealedPair.body.from_name, 'Аня')
    assert.equal(revealedPair.body.to_name, 'Борис')

    const unauthorized = await request('GET', '/me/games', undefined, { 'x-test-no-cookies': true })
    assert.equal(unauthorized.status, 401)
  })

  it('быстро распределяет пары без создания игры', async () => {
    const response = await request('POST', '/randomizer', { names: 'Аня, Борис, Вика, Аня' })
    assert.equal(response.status, 200)
    assert.equal(response.body.length, 3)
    assert.ok(response.body.every((pair) => pair.from !== pair.to))
    assert.deepEqual(new Set(response.body.map((pair) => pair.to)), new Set(['Аня', 'Борис', 'Вика']))

    const invalid = await request('POST', '/randomizer', { names: 'Аня' })
    assert.equal(invalid.status, 400)
  })

  it('формирует ссылки без пустого домена', async () => {
    const game = await createGame()
    await addParticipants(game.token, ['Аня'])
    const original = process.env.DOMAIN
    process.env.DOMAIN = ''
    try {
      const invite = await request('GET', `/games/${game.token}/invite`)
      assert.equal(invite.status, 200)
      assert.ok(invite.body.commonUrl.startsWith(`/game/${game.token}`))
      assert.ok(invite.body.participants.every((person) => person.url.startsWith('/join/')))
    } finally {
      process.env.DOMAIN = original
    }

    const originalAppUrl = process.env.APP_URL
    const originalDomainName = process.env.DOMAIN_NAME
    process.env.APP_URL = 'http://${DOMAIN_NAME}:5173'
    process.env.DOMAIN_NAME = 'santa.local'
    try {
      const invite = await request('GET', `/games/${game.token}/invite`)
      assert.equal(invite.body.commonUrl, `http://santa.local:5173/game/${game.token}`)
    } finally {
      if (originalAppUrl === undefined) delete process.env.APP_URL
      else process.env.APP_URL = originalAppUrl
      if (originalDomainName === undefined) delete process.env.DOMAIN_NAME
      else process.env.DOMAIN_NAME = originalDomainName
    }

    process.env.APP_URL = 'http://localhost:5173'
    try {
      const invite = await request('GET', `/games/${game.token}/invite`)
      assert.equal(invite.body.commonUrl, `http://localhost:5173/game/${game.token}`)
      assert.ok(invite.body.participants.every((person) => person.url.startsWith('http://localhost:5173/join/')))
    } finally {
      if (originalAppUrl === undefined) delete process.env.APP_URL
      else process.env.APP_URL = originalAppUrl
    }

    const originalDomainNameFallback = process.env.DOMAIN_NAME
    process.env.APP_URL = ''
    process.env.DOMAIN_NAME = 'localhost:5173'
    try {
      const invite = await request('GET', `/games/${game.token}/invite`)
      assert.equal(invite.body.commonUrl, `http://localhost:5173/game/${game.token}`)
    } finally {
      if (originalDomainNameFallback === undefined) delete process.env.DOMAIN_NAME
      else process.env.DOMAIN_NAME = originalDomainNameFallback
      if (originalAppUrl === undefined) delete process.env.APP_URL
      else process.env.APP_URL = originalAppUrl
    }
  })

  it('удаляет участника и перестраивает пары', async () => {
    const game = await createGame()
    await addParticipants(game.token, ['Аня', 'Борис', 'Вика'])
    const drawn = await request('POST', `/games/${game.token}/draw`)
    assert.equal(drawn.body.length, 3)

    const removedPerson = drawn.body[0].from_id
    const removed = await request('DELETE', `/games/${game.token}/participants/${removedPerson}`)
    assert.equal(removed.status, 200)
    assert.equal(removed.body.pairs.length, 2)
    assert.ok(removed.body.pairs.every((pair) => pair.from_id !== removedPerson && pair.to_id !== removedPerson))

    const missing = await request('DELETE', `/games/${game.token}/participants/${removedPerson}`)
    assert.equal(missing.status, 404)
  })

  it('проводит анкету участника с валидацией и лимитом вопросов', async () => {
    const owner = await request('POST', '/auth/session', {})
    const headers = cookieHeader(owner)
    const game = await createGame('Анкета', headers)
    const people = await addParticipants(game.token, ['Аня', 'Борис'], headers)

    const age = await request(
      'POST',
      `/games/${game.token}/questions`,
      {
        title: 'Возраст',
        type: 'number',
        required: true,
        position: 1,
      },
      headers,
    )
    assert.equal(age.status, 201)
    const hobbies = await request(
      'POST',
      `/games/${game.token}/questions`,
      {
        title: 'Хобби',
        hint: 'Книги, Спорт',
        type: 'multi',
        options: ['Книги', 'Спорт', 'Игры'],
        position: 2,
      },
      headers,
    )
    assert.equal(hobbies.status, 201)

    const missing = await request(
      'PUT',
      `/games/${game.token}/participants/${people[0].id}/answers`,
      {
        answers: [],
      },
      { 'x-invite-token': people[0].invite_token, 'x-test-no-cookies': true },
    )
    assert.equal(missing.status, 400)
    assert.match(missing.body.error.message, /обязателен/)

    const invalid = await request(
      'PUT',
      `/games/${game.token}/participants/${people[0].id}/answers`,
      {
        answers: [{ questionId: age.body.id, value: 'тридцать' }],
      },
      { 'x-invite-token': people[0].invite_token, 'x-test-no-cookies': true },
    )
    assert.equal(invalid.status, 400)
    assert.match(invalid.body.error.message, /требует число/)

    const saved = await request(
      'PUT',
      `/games/${game.token}/participants/${people[0].id}/answers`,
      {
        answers: [
          { questionId: age.body.id, value: '30' },
          { questionId: hobbies.body.id, value: 'Книги,Спорт' },
        ],
      },
      { 'x-invite-token': people[0].invite_token, 'x-test-no-cookies': true },
    )
    assert.equal(saved.status, 200)
    assert.equal(saved.body.length, 2)

    const mine = await request('GET', `/games/${game.token}/participants/${people[0].id}/answers`, undefined, {
      'x-invite-token': people[0].invite_token,
      'x-test-no-cookies': true,
    })
    assert.equal(mine.body.length, 2)
    assert.equal(mine.body[0].value, '30')

    const all = await request('GET', `/games/${game.token}/answers`, undefined, headers)
    assert.equal(all.body.length, 2)
    assert.equal(all.body[0].question_title, 'Возраст')
    assert.equal(all.body[0].participant_name, 'Аня')

    for (let index = 2; index < 10; index += 1) {
      const extra = await request(
        'POST',
        `/games/${game.token}/questions`,
        {
          title: `Вопрос ${index}`,
          position: index,
        },
        headers,
      )
      assert.equal(extra.status, 201)
    }
    const limit = await request('POST', `/games/${game.token}/questions`, { title: 'Одиннадцатый' }, headers)
    assert.equal(limit.status, 400)
    assert.match(limit.body.error.message, /10 вопросов/)
  })

  it('приглашает организатора по ссылке и защищает последнего организатора', async () => {
    const owner = await request('POST', '/auth/session', {})
    const session = await request('POST', '/auth/session', {})
    const game = await createGame('Организаторы', cookieHeader(owner))
    const invite = await request('POST', `/games/${game.token}/organizers/invite`, undefined, cookieHeader(owner))
    assert.equal(invite.status, 201)
    assert.match(invite.body.url, /https:\/\/santa\.local\/organizer\//)

    const pending = await request('GET', `/games/${game.token}/organizers`, undefined, cookieHeader(owner))
    assert.ok(pending.body.some((organizer) => organizer.id === invite.body.id && organizer.status === 'pending'))
    assert.ok(pending.body.every((organizer) => !('user_token' in organizer)))
    assert.ok(pending.body.every((organizer) => !('user_email' in organizer)))
    assert.ok(pending.body.every((organizer) => !('invited_token' in organizer)))
    const earlyOwnerRemoval = await request(
      'DELETE',
      `/games/${game.token}/organizers/${pending.body[0].id}`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(earlyOwnerRemoval.status, 409)

    const accepted = await request('POST', `/organizer-invites/${invite.body.token}/accept`, {}, cookieHeader(session))
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.id, game.id)
    assert.equal(accepted.body.token, game.token)

    const organizers = await request('GET', `/games/${game.token}/organizers`, undefined, cookieHeader(owner))
    assert.equal(organizers.body.length, 2)

    const third = await request('POST', `/games/${game.token}/organizers/invite`, undefined, cookieHeader(owner))
    assert.equal(third.status, 201)
    const fourth = await request('POST', `/games/${game.token}/organizers/invite`, undefined, cookieHeader(owner))
    assert.equal(fourth.status, 409)

    const firstRemoval = await request(
      'DELETE',
      `/games/${game.token}/organizers/${organizers.body[0].id}`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(firstRemoval.status, 200)
    const remaining = await request('GET', `/games/${game.token}/organizers`, undefined, cookieHeader(session))
    const lastAccepted = remaining.body.find((item) => item.status === 'accepted')
    const removePending = await request(
      'DELETE',
      `/games/${game.token}/organizers/${third.body.id}`,
      undefined,
      cookieHeader(session),
    )
    assert.equal(removePending.status, 200)
    const guard = await request(
      'DELETE',
      `/games/${game.token}/organizers/${lastAccepted.id}`,
      undefined,
      cookieHeader(session),
    )
    assert.equal(guard.status, 409)
  })

  it('управляет вопросами, сообщениями, организаторами и поддоменами', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Управление', cookieHeader(owner))
    const people = await addParticipants(game.token, ['Аня', 'Борис'], cookieHeader(owner))
    const session = await request('POST', '/auth/session', {})

    const question = await request(
      'POST',
      `/games/${game.token}/questions`,
      {
        title: 'Что подарить?',
        type: 'single',
        required: true,
        options: ['Книги', 'Настолки'],
      },
      cookieHeader(owner),
    )
    assert.equal(question.status, 201)
    assert.deepEqual(question.body.options, ['Книги', 'Настолки'])
    const updated = await request(
      'PATCH',
      `/games/${game.token}/questions/${question.body.id}`,
      { title: 'Идея подарка' },
      cookieHeader(owner),
    )
    assert.equal(updated.body.title, 'Идея подарка')
    const deleted = await request(
      'DELETE',
      `/games/${game.token}/questions/${question.body.id}`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(deleted.status, 200)

    const message = await request(
      'POST',
      `/games/${game.token}/messages`,
      { body: 'Напоминание', toId: people[1].id },
      cookieHeader(owner),
    )
    assert.equal(message.status, 201)
    const messages = await request('GET', `/games/${game.token}/messages`, undefined, cookieHeader(owner))
    assert.equal(messages.body.length, 1)

    const organizer = await request(
      'POST',
      `/games/${game.token}/organizers`,
      { token: session.body.user.token },
      cookieHeader(owner),
    )
    assert.equal(organizer.status, 201)
    const organizers = await request('GET', `/games/${game.token}/organizers`, undefined, cookieHeader(owner))
    assert.equal(organizers.body.length, 2)

    const tenant = await request(
      'POST',
      '/tenants',
      { slug: 'company', gameId: game.id, domain: 'santa.local' },
      cookieHeader(owner),
    )
    assert.equal(tenant.status, 201)
    const resolved = await request('GET', '/tenants/company', undefined, cookieHeader(owner))
    assert.equal(resolved.status, 200)
    assert.equal(resolved.body.game.title, game.title)
    const current = await request('GET', '/tenants/current')
    assert.equal(current.body.tenant, null)
    const tenantList = await request('GET', '/tenants', undefined, cookieHeader(owner))
    assert.equal(tenantList.status, 200)
    assert.ok(tenantList.body.some((item) => item.slug === 'company'))

    const invalid = await request('POST', '/tenants', { slug: 'bad slug', gameId: game.id }, cookieHeader(owner))
    assert.equal(invalid.status, 400)
    const reserved = await request('POST', '/tenants', { slug: 'admin', gameId: game.id }, cookieHeader(owner))
    assert.equal(reserved.status, 409)
  })

  it('импортирует прошлые пары без раскрытия и исключает их', async () => {
    const anna = await request('POST', '/auth/session', {})
    const boris = await request('POST', '/auth/session', {})

    async function join(gameId, name, session) {
      await addParticipants(gameId, [name], cookieHeader(anna))
      const invite = await request('GET', `/games/${gameId}/invite`, undefined, cookieHeader(anna))
      const person = invite.body.participants.find((item) => item.name === name)
      const accepted = await request('POST', `/invites/${person.invite_token}/accept`, {}, cookieHeader(session))
      assert.equal(accepted.status, 200)
    }

    const past = await createGame('Прошлая игра', cookieHeader(anna))
    await join(past.id, 'Аня', anna)
    await join(past.id, 'Борис', boris)
    const pastDraw = await request('POST', `/games/${past.id}/draw`, undefined, cookieHeader(anna))
    assert.equal(pastDraw.status, 200)

    const current = await createGame('Новая игра', cookieHeader(anna))
    await join(current.id, 'Аня', anna)
    await join(current.id, 'Борис', boris)

    const pastGames = await request('GET', '/me/past-games', undefined, cookieHeader(anna))
    assert.ok(pastGames.body.some((item) => item.id === past.id))

    const imported = await request(
      'POST',
      `/games/${current.id}/past-pairs/import`,
      { pastGameId: past.id },
      cookieHeader(anna),
    )
    assert.equal(imported.status, 201)
    assert.equal(imported.body.imported, 2)

    const loaded = await request('GET', `/games/${current.id}`, undefined, cookieHeader(anna))
    assert.equal(loaded.body.pastPairsCount, 2)
    assert.equal(loaded.body.pastPairs, undefined)

    db.prepare(
      `
      INSERT OR IGNORE INTO past_pairs (game_id, from_token, to_token)
      VALUES (?, ?, ?)
    `,
    ).run(
      current.id,
      db
        .prepare('SELECT identity_token FROM participants WHERE game_id = ? AND user_id = ?')
        .get(current.id, boris.body.user.id).identity_token,
      db
        .prepare('SELECT identity_token FROM participants WHERE game_id = ? AND user_id = ?')
        .get(current.id, anna.body.user.id).identity_token,
    )

    const blocked = await request('POST', `/games/${current.id}/draw`, undefined, cookieHeader(anna))
    assert.equal(blocked.status, 409)
    assert.match(blocked.body.error.message, /ограничениями/)
  })

  it('ведёт прогресс и отправляет массовые напоминания', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Прогресс', cookieHeader(owner))
    const people = await addParticipants(game.token, ['Аня', 'Борис'], cookieHeader(owner))
    await request(
      'PATCH',
      `/games/${game.token}/participants/${people[0].id}`,
      { email: 'anya@example.com' },
      cookieHeader(owner),
    )

    const before = await request('GET', `/games/${game.token}`, undefined, cookieHeader(owner))
    assert.equal(before.body.progress.sent, 0)
    assert.equal(before.body.progress.received, 0)

    const sent = await request(
      'POST',
      `/games/${game.token}/participants/${people[0].id}/gift-sent`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(sent.status, 200)
    const received = await request(
      'POST',
      `/games/${game.token}/participants/${people[0].id}/gift-received`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(received.status, 200)

    const after = await request('GET', `/games/${game.token}`, undefined, cookieHeader(owner))
    assert.equal(after.body.progress.sent, 50)
    assert.equal(after.body.progress.received, 50)

    const reminder = await request(
      'POST',
      `/games/${game.token}/reminders`,
      { body: 'Не забудьте карточку', recipientIds: [people[0].id, people[1].id] },
      cookieHeader(owner),
    )
    assert.equal(reminder.status, 201)
    assert.deepEqual(
      reminder.body.map((item) => item.status),
      ['sent', 'queued'],
    )
    assert.equal(reminder.body[1].error, 'Email не указан')

    const duplicate = await request(
      'POST',
      `/games/${game.token}/reminders`,
      { body: 'Не забудьте карточку', recipientIds: [people[0].id, people[1].id] },
      cookieHeader(owner),
    )
    assert.equal(duplicate.status, 409)
    assert.match(duplicate.body.error.message, /уже отправлено/)

    const reminders = await request('GET', `/games/${game.token}/reminders`, undefined, cookieHeader(owner))
    assert.equal(reminders.body.length, 2)
  })

  it('проверяет права организаторов', async () => {
    const owner = await request('POST', '/auth/session', {})
    const outsider = await request('POST', '/auth/session', {})
    const game = await createGame('Права доступа', cookieHeader(owner))

    const allowed = await request(
      'POST',
      `/games/${game.token}/participants`,
      { name: 'Свой участник' },
      cookieHeader(owner),
    )
    assert.equal(allowed.status, 201)

    const denied = await request(
      'POST',
      `/games/${game.token}/participants`,
      { name: 'Чужой участник' },
      cookieHeader(outsider),
    )
    assert.equal(denied.status, 403)
    assert.match(denied.body.error.message, /организатор|доступ/i)

    const anonymous = await request('POST', `/games/${game.token}/participants`, {
      name: 'Без сессии',
    })
    assert.equal(anonymous.status, 403)
  })

  it('закрывает приватные данные от доступа без ссылки и токена участника', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Приватность', cookieHeader(owner))
    const people = await addParticipants(game.token, ['Аня', 'Борис'], cookieHeader(owner))

    const byId = await request('GET', `/games/${game.id}`, undefined, { 'x-test-no-cookies': true })
    assert.equal(byId.status, 403)

    const byToken = await request('GET', `/games/${game.token}`, undefined, {
      'x-game-token': game.token,
      'x-test-no-cookies': true,
    })
    assert.equal(byToken.status, 200)
    assert.equal(byToken.body.canManage, false)
    assert.deepEqual(byToken.body.pairs, [])
    assert.deepEqual(byToken.body.events, [])
    assert.ok(byToken.body.participants.every((person) => !('wishlist' in person)))

    for (const path of ['pairs', 'answers', 'events', 'exclusions', 'invite']) {
      const denied = await request('GET', `/games/${game.token}/${path}`, undefined, {
        'x-game-token': game.token,
        'x-test-no-cookies': true,
      })
      assert.equal(denied.status, 403)
    }

    const deniedQuestions = await request('GET', `/games/${game.token}/questions`, undefined, {
      'x-test-no-cookies': true,
    })
    assert.equal(deniedQuestions.status, 403)

    const allowedQuestions = await request('GET', `/games/${game.token}/questions`, undefined, {
      'x-invite-token': people[0].invite_token,
      'x-test-no-cookies': true,
    })
    assert.equal(allowedQuestions.status, 200)

    const allowedAnswers = await request(
      'GET',
      `/games/${game.token}/participants/${people[0].id}/answers`,
      undefined,
      { 'x-invite-token': people[0].invite_token, 'x-test-no-cookies': true },
    )
    assert.equal(allowedAnswers.status, 200)

    const deniedAnswers = await request('GET', `/games/${game.token}/participants/${people[0].id}/answers`, undefined, {
      'x-invite-token': 'wrong-token',
      'x-test-no-cookies': true,
    })
    assert.equal(deniedAnswers.status, 403)
  })

  it('не даёт доступ к игре через чужой поддомен', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Поддомен', cookieHeader(owner))
    const other = await createGame('Другой поддомен', cookieHeader(owner))
    const tenant = await request('POST', '/tenants', { slug: 'private', gameId: other.id }, cookieHeader(owner))
    assert.equal(tenant.status, 201)

    const denied = await request('GET', `/games/${game.token}`, undefined, {
      'x-forwarded-host': 'private.santa.local',
      'x-test-no-cookies': true,
    })
    assert.equal(denied.status, 403)
  })

  it('не позволяет перепривязать принятое приглашение к другому аккаунту', async () => {
    const owner = await request('POST', '/auth/session', {})
    const invitee = await request('POST', '/auth/session', {})
    const outsider = await request('POST', '/auth/session', {})
    const game = await createGame('Привязка', cookieHeader(owner))
    const [person] = await addParticipants(game.token, ['Аня'], cookieHeader(owner))

    const accepted = await request('POST', `/invites/${person.invite_token}/accept`, {}, cookieHeader(invitee))
    assert.equal(accepted.status, 200)

    const conflict = await request('POST', `/invites/${person.invite_token}/accept`, {}, cookieHeader(outsider))
    assert.equal(conflict.status, 409)
  })

  it('записывает автора событий в историю', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Autor', cookieHeader(owner))
    const response = await request('GET', `/games/${game.token}`, undefined, cookieHeader(owner))
    const created = response.body.events.find((item) => item.text === 'Игра создана')
    assert.equal(created.actor, String(owner.body.user.id))
  })

  it('принимает обращения в поддержку', async () => {
    const response = await request('POST', '/support', {
      email: 'user@example.test',
      subject: 'Вопрос по игре',
      body: 'Не приходит напоминание участнику.',
    })
    assert.equal(response.status, 201)
    assert.ok(response.body.id)

    const invalid = await request('POST', '/support', { subject: '', body: '   ' })
    assert.equal(invalid.status, 400)
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

  it('требует CSRF-токен для изменений с активной сессией', async () => {
    const session = await request('POST', '/auth/session', {})
    assert.equal(session.status, 201)
    assert.ok(cookies.get('santa_csrf'))

    const rejected = await request(
      'POST',
      '/games',
      { title: 'Без токена', themeId: 'winter' },
      {
        'x-csrf-token': '',
      },
    )
    assert.equal(rejected.status, 403)

    const allowed = await createGame('С токеном')
    assert.ok(allowed.id)
  })

  it('ограничивает частоту жеребьёвки', async () => {
    const game = await createGame('Лимит жеребьёвки')
    await addParticipants(game.token, ['Аня', 'Борис', 'Вика'])
    const statuses = []
    for (let index = 0; index < 11; index += 1) {
      const response = await request('POST', `/games/${game.token}/draw`)
      statuses.push(response.status)
    }
    assert.equal(statuses.filter((status) => status === 200).length, 10)
    assert.equal(statuses.at(-1), 429)
  })

  it('считает метрики воронки без персональных данных', async () => {
    const owner = await request('POST', '/auth/session', {})
    const headers = cookieHeader(owner)
    await createGame('Первая игра', headers)
    const game = await createGame('Вторая игра', headers)
    await request('POST', `/games/${game.token}/participants/bulk`, { names: 'Аня, Борис, Вика' }, headers)
    await request('POST', `/games/${game.token}/draw`, undefined, headers)
    await request(
      'POST',
      `/games/${game.token}/participants/${db.prepare('SELECT id FROM participants WHERE game_id = ? LIMIT 1').get(game.id).id}/gift-sent`,
      undefined,
      headers,
    )

    const response = await request('GET', '/metrics')
    assert.equal(response.status, 200)
    const counts = Object.fromEntries(response.body.stages.map((stage) => [stage.key, stage.count]))
    assert.deepEqual(counts, {
      game_created: 2,
      participant_invited: 1,
      draw_completed: 1,
      gift_sent: 1,
      organizer_return: 1,
    })
    assert.deepEqual(
      response.body.stages.map((stage) => stage.conversion),
      [100, 50, 50, 50, 50],
    )
    assert.ok(!JSON.stringify(response.body).includes(owner.body.user.token))
  })

  it('проводит анонимный чат только между раскрытыми парами', async () => {
    const owner = await request('POST', '/auth/session', {})
    const headers = cookieHeader(owner)
    const game = await createGame('Чат', headers)
    const [anna, boris] = await addParticipants(game.token, ['Аня', 'Борис'], headers)
    const invite = await request('GET', `/games/${game.token}/invite`, undefined, headers)
    const annaToken = invite.body.participants.find((person) => person.id === anna.id).invite_token
    const borisToken = invite.body.participants.find((person) => person.id === boris.id).invite_token

    const tooEarly = await request('GET', `/games/${game.token}/chat`, undefined, {
      'x-invite-token': annaToken,
      'x-test-no-cookies': true,
    })
    assert.equal(tooEarly.status, 403)

    const drawn = await request('POST', `/games/${game.token}/draw`, undefined, headers)
    assert.equal(drawn.status, 200)
    const fromAnna = drawn.body.find((pair) => pair.from_id === anna.id)
    const revealed = await request('POST', `/games/${game.token}/reveal`, { fromId: anna.id }, headers)
    assert.equal(revealed.status, 200)
    assert.equal(fromAnna.to_id, boris.id)

    const sent = await request(
      'POST',
      `/games/${game.token}/chat`,
      { body: 'Привет!', imageUrl: 'https://example.test/gift.png' },
      { 'x-invite-token': annaToken, 'x-test-no-cookies': true },
    )
    assert.equal(sent.status, 201)

    const annaChat = await request('GET', `/games/${game.token}/chat`, undefined, {
      'x-invite-token': annaToken,
      'x-test-no-cookies': true,
    })
    assert.equal(annaChat.status, 200)
    assert.equal(annaChat.body.length, 1)
    assert.equal(annaChat.body[0].mine, true)
    assert.equal(annaChat.body[0].body, 'Привет!')
    assert.equal(annaChat.body[0].imageUrl, 'https://example.test/gift.png')

    const borisChat = await request('GET', `/games/${game.token}/chat`, undefined, {
      'x-invite-token': borisToken,
      'x-test-no-cookies': true,
    })
    assert.equal(borisChat.body.length, 1)
    assert.equal(borisChat.body[0].mine, false)
    assert.ok(!JSON.stringify(borisChat.body).includes('Аня'))
    assert.ok(!JSON.stringify(borisChat.body).includes('Борис'))

    const empty = await request(
      'POST',
      `/games/${game.token}/chat`,
      {},
      {
        'x-invite-token': annaToken,
        'x-test-no-cookies': true,
      },
    )
    assert.equal(empty.status, 400)
    const invalidUrl = await request(
      'POST',
      `/games/${game.token}/chat`,
      { imageUrl: 'ftp://example.test/gift.png' },
      { 'x-invite-token': annaToken, 'x-test-no-cookies': true },
    )
    assert.equal(invalidUrl.status, 400)

    const notifications = await request('GET', `/games/${game.token}/notifications`, undefined, {
      'x-invite-token': borisToken,
      'x-test-no-cookies': true,
    })
    assert.ok(notifications.body.some((item) => item.kind === 'pair_revealed'))
    assert.ok(notifications.body.some((item) => item.kind === 'chat_message'))
  })

  it('применяет изменения жеребьёвки только после сохранения и уведомляет участников', async () => {
    const owner = await request('POST', '/auth/session', {})
    const headers = cookieHeader(owner)
    const game = await createGame('Сохранение пар', headers)
    const [anna, boris] = await addParticipants(game.token, ['Аня', 'Борис'], headers)
    const invite = await request('GET', `/games/${game.token}/invite`, undefined, headers)
    const annaToken = invite.body.participants.find((person) => person.id === anna.id).invite_token

    await request('POST', `/games/${game.token}/exclusions`, { fromId: anna.id, toId: boris.id }, headers)
    await request('POST', `/games/${game.token}/exclusions`, { fromId: boris.id, toId: anna.id }, headers)
    const impossible = await request('POST', `/games/${game.token}/draw`, undefined, headers)
    assert.equal(impossible.status, 409)
    const unchanged = await request('GET', `/games/${game.token}`, undefined, headers)
    assert.deepEqual(unchanged.body.pairs, [])

    await request('DELETE', `/games/${game.token}/exclusions/${anna.id}/${boris.id}`, undefined, headers)
    await request('DELETE', `/games/${game.token}/exclusions/${boris.id}/${anna.id}`, undefined, headers)
    const saved = await request('POST', `/games/${game.token}/draw`, undefined, headers)
    assert.equal(saved.status, 200)
    const notifications = await request('GET', `/games/${game.token}/notifications`, undefined, {
      'x-invite-token': annaToken,
      'x-test-no-cookies': true,
    })
    assert.ok(notifications.body.some((item) => item.kind === 'draw_changed'))
  })
})
