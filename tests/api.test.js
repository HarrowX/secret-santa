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

async function createGame(title = 'Тестовая игра', headers = {}) {
  const response = await request('POST', '/games', { title, themeId: 'winter' }, headers)
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

  it('создаёт игру и возвращает её в списке', async () => {
    const game = await createGame('Зима')
    assert.equal(game.theme_id, 'winter')
    assert.match(game.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

    const byToken = await request('GET', `/games/${game.token}`)
    assert.equal(byToken.status, 200)
    assert.equal(byToken.body.game.id, game.id)

    const list = await request('GET', '/games')
    assert.equal(list.status, 200)
    assert.equal(list.body.length, 1)
    assert.equal(list.body[0].participants_count, 0)
  })

  it('сохраняет название, бюджет, дату, правила и тему игры', async () => {
    const response = await request('POST', '/games', {
      title: 'Подробная игра',
      budget: '1 500 ₽',
      exchangeDate: '2026-12-25',
      rules: 'Без алкоголя',
      themeId: 'space',
    })
    assert.equal(response.status, 201)
    assert.equal(response.body.budget, '1 500 ₽')
    assert.equal(response.body.exchange_date, '2026-12-25')
    assert.equal(response.body.rules, 'Без алкоголя')
    assert.equal(response.body.theme_id, 'space')

    const loaded = await request('GET', `/games/${response.body.id}`)
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
    const game = await createGame('Карточка')
    const [person] = await addParticipants(game.id, ['Вика'])
    const session = await request('POST', '/auth/session', {})

    const patched = await request(
      'PATCH',
      `/games/${game.id}/participants/${person.id}`,
      {
        name: 'Виктория',
        email: 'vika@example.test',
        wishlist: 'Книги',
        address: 'Москва',
        notes: 'Только не сладости',
        preferred: 'Аня',
      },
      cookieHeader(session),
    )
    assert.equal(patched.status, 200)
    assert.equal(patched.body.wishlist, 'Книги')
    assert.equal(patched.body.preferred, 'Аня')

    const invite = await request('GET', `/games/${game.id}/invite`)
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

    const notifications = await request('GET', `/games/${game.id}/notifications`)
    assert.ok(notifications.body.length >= 2)
    assert.equal(notifications.body[0].kind, 'card_updated')
    assert.equal(JSON.parse(notifications.body[0].payload).wishlist, 'Книги и настолки')
  })

  it('добавляет участников списком и обрабатывает персональные приглашения', async () => {
    const game = await createGame('Приглашения')
    const bulk = await request('POST', `/games/${game.id}/participants/bulk`, {
      names: 'Аня, Борис, Аня,\nВика',
    })
    assert.equal(bulk.status, 201)
    assert.equal(bulk.body.added, 3)

    const invite = await request('GET', `/games/${game.id}/invite`)
    assert.equal(invite.status, 200)
    assert.ok(invite.body.commonUrl.endsWith(`/game/${game.token}`))
    assert.equal(invite.body.participants.length, 3)
    assert.ok(invite.body.participants.every((person) => person.url.includes('/join/')))

    const person = invite.body.participants.find((item) => item.name === 'Аня')
    const opened = await request('GET', `/invites/${person.invite_token}`)
    assert.equal(opened.status, 200)
    assert.equal(opened.body.participant.name, 'Аня')
    assert.equal(opened.body.game.id, game.id)

    const accepted = await request('POST', `/invites/${person.invite_token}/accept`, {
      email: 'anya@example.test',
    })
    assert.equal(accepted.status, 200)
    const updated = await request('GET', `/games/${game.id}`)
    const stored = updated.body.participants.find((item) => item.id === person.id)
    assert.equal(stored.email, 'anya@example.test')
    assert.equal(stored.filled, 1)

    const patched = await request('PATCH', `/games/${game.id}/participants/${person.id}`, {
      name: 'Анна',
    })
    assert.equal(patched.status, 200)
    assert.equal(patched.body.name, 'Анна')

    const empty = await request('POST', `/games/${game.id}/participants/bulk`, { names: '   ' })
    assert.equal(empty.status, 400)
  })

  it('добавляет участников после жеребьёвки и распределяет только новых', async () => {
    const game = await createGame('Новые участники')
    const [first, second] = await addParticipants(game.id, ['Аня', 'Борис'])
    const initial = await request('POST', `/games/${game.id}/draw`)
    assert.equal(initial.status, 200)

    const [third, fourth] = await addParticipants(game.id, ['Вика', 'Гена'])
    const extra = await request('POST', `/games/${game.id}/draw/new`)
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

    const namedPairs = await request('GET', `/games/${game.id}/pairs`)
    assert.ok(namedPairs.body.every((pair) => pair.from_name && pair.to_name))

    const repeated = await request('POST', `/games/${game.id}/draw/new`)
    assert.equal(repeated.status, 400)
  })

  it('управляет исключениями и ручными парами при повторной жеребьёвке', async () => {
    const game = await createGame('Управление парами')
    const [first, second, third] = await addParticipants(game.id, ['Аня', 'Борис', 'Вика'])

    const exclusion = await request('POST', `/games/${game.id}/exclusions`, {
      fromId: first.id,
      toId: second.id,
    })
    assert.equal(exclusion.status, 201)
    const loaded = await request('GET', `/games/${game.id}`)
    assert.equal(loaded.body.exclusions.length, 1)

    const manual = await request('POST', `/games/${game.id}/pairs`, {
      fromId: first.id,
      toId: third.id,
    })
    assert.equal(manual.status, 200)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const draw = await request('POST', `/games/${game.id}/draw`)
      assert.equal(draw.status, 200)
      const pair = draw.body.find((item) => item.from_id === first.id)
      assert.equal(pair.to_id, third.id)
      assert.equal(pair.manual, 1)
    }

    const removed = await request('DELETE', `/games/${game.id}/exclusions/${first.id}/${second.id}`)
    assert.equal(removed.status, 200)
    const reset = await request('POST', `/games/${game.id}/pairs/reset`)
    assert.equal(reset.status, 200)
    const pairs = await request('GET', `/games/${game.id}/pairs`)
    assert.equal(pairs.body.length, 0)
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
    assert.ok(manual.body.some((pair) => pair.manual))
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

  it('показывает пользователю его игры и раскрытый обмен', async () => {
    const session = await request('POST', '/auth/session', {})
    const headers = cookieHeader(session)
    const game = await createGame('Мой кабинет')
    const [person] = await addParticipants(game.id, ['Аня', 'Борис'])
    const invite = await request('GET', `/games/${game.id}/invite`)
    const token = invite.body.participants[0].invite_token
    const accepted = await request('POST', `/invites/${token}/accept`, { wishlist: 'Книги' }, headers)
    assert.equal(accepted.body.participant.user_id, session.body.user.id)
    await request('POST', `/games/${game.id}/draw`)
    await request('POST', `/games/${game.id}/reveal`, { fromId: person.id })

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

    const unauthorized = await request('GET', '/me/games')
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
    await addParticipants(game.id, ['Аня'])
    const original = process.env.DOMAIN
    process.env.DOMAIN = ''
    try {
      const invite = await request('GET', `/games/${game.id}/invite`)
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
      const invite = await request('GET', `/games/${game.id}/invite`)
      assert.equal(invite.body.commonUrl, `http://santa.local:5173/game/${game.token}`)
    } finally {
      if (originalAppUrl === undefined) delete process.env.APP_URL
      else process.env.APP_URL = originalAppUrl
      if (originalDomainName === undefined) delete process.env.DOMAIN_NAME
      else process.env.DOMAIN_NAME = originalDomainName
    }

    process.env.APP_URL = 'http://localhost'
    try {
      const invite = await request('GET', `/games/${game.id}/invite`)
      assert.equal(invite.body.commonUrl, `http://localhost/game/${game.token}`)
      assert.ok(invite.body.participants.every((person) => person.url.startsWith('http://localhost/join/')))
    } finally {
      if (originalAppUrl === undefined) delete process.env.APP_URL
      else process.env.APP_URL = originalAppUrl
    }
  })

  it('удаляет участника и перестраивает пары', async () => {
    const game = await createGame()
    await addParticipants(game.id, ['Аня', 'Борис', 'Вика'])
    const drawn = await request('POST', `/games/${game.id}/draw`)
    assert.equal(drawn.body.length, 3)

    const removedPerson = drawn.body[0].from_id
    const removed = await request('DELETE', `/games/${game.id}/participants/${removedPerson}`)
    assert.equal(removed.status, 200)
    assert.equal(removed.body.pairs.length, 2)
    assert.ok(removed.body.pairs.every((pair) => pair.from_id !== removedPerson && pair.to_id !== removedPerson))

    const missing = await request('DELETE', `/games/${game.id}/participants/${removedPerson}`)
    assert.equal(missing.status, 404)
  })

  it('проводит анкету участника с валидацией и лимитом вопросов', async () => {
    const game = await createGame()
    const people = await addParticipants(game.id, ['Аня', 'Борис'])

    const age = await request('POST', `/games/${game.id}/questions`, {
      title: 'Возраст',
      type: 'number',
      required: true,
      position: 1,
    })
    assert.equal(age.status, 201)
    const hobbies = await request('POST', `/games/${game.id}/questions`, {
      title: 'Хобби',
      hint: 'Книги, Спорт',
      type: 'multi',
      position: 2,
    })
    assert.equal(hobbies.status, 201)

    const missing = await request('PUT', `/games/${game.id}/participants/${people[0].id}/answers`, {
      answers: [],
    })
    assert.equal(missing.status, 400)
    assert.match(missing.body.error.message, /обязателен/)

    const invalid = await request('PUT', `/games/${game.id}/participants/${people[0].id}/answers`, {
      answers: [{ questionId: age.body.id, value: 'тридцать' }],
    })
    assert.equal(invalid.status, 400)
    assert.match(invalid.body.error.message, /требует число/)

    const saved = await request('PUT', `/games/${game.id}/participants/${people[0].id}/answers`, {
      answers: [
        { questionId: age.body.id, value: '30' },
        { questionId: hobbies.body.id, value: 'Книги, Спорт' },
      ],
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.length, 2)

    const mine = await request('GET', `/games/${game.id}/participants/${people[0].id}/answers`)
    assert.equal(mine.body.length, 2)
    assert.equal(mine.body[0].value, '30')

    const all = await request('GET', `/games/${game.id}/answers`)
    assert.equal(all.body.length, 2)
    assert.equal(all.body[0].question_title, 'Возраст')
    assert.equal(all.body[0].participant_name, 'Аня')

    for (let index = 2; index < 10; index += 1) {
      const extra = await request('POST', `/games/${game.id}/questions`, {
        title: `Вопрос ${index}`,
        position: index,
      })
      assert.equal(extra.status, 201)
    }
    const limit = await request('POST', `/games/${game.id}/questions`, { title: 'Одиннадцатый' })
    assert.equal(limit.status, 400)
    assert.match(limit.body.error.message, /10 вопросов/)
  })

  it('приглашает организатора по ссылке и защищает последнего организатора', async () => {
    const owner = await request('POST', '/auth/session', {})
    const session = await request('POST', '/auth/session', {})
    const game = await createGame('Организаторы', cookieHeader(owner))
    const invite = await request('POST', `/games/${game.id}/organizers/invite`, undefined, cookieHeader(owner))
    assert.equal(invite.status, 201)
    assert.match(invite.body.url, /https:\/\/santa\.local\/organizer\//)

    const pending = await request('GET', `/games/${game.id}/organizers`, undefined, cookieHeader(owner))
    assert.ok(pending.body.some((organizer) => organizer.url === invite.body.url))
    const earlyOwnerRemoval = await request(
      'DELETE',
      `/games/${game.id}/organizers/${pending.body[0].id}`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(earlyOwnerRemoval.status, 409)

    const accepted = await request('POST', `/organizer-invites/${invite.body.token}/accept`, {}, cookieHeader(session))
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.id, game.id)
    assert.equal(accepted.body.token, game.token)

    const organizers = await request('GET', `/games/${game.id}/organizers`, undefined, cookieHeader(owner))
    assert.equal(organizers.body.length, 2)

    const third = await request('POST', `/games/${game.id}/organizers/invite`, undefined, cookieHeader(owner))
    assert.equal(third.status, 201)
    const fourth = await request('POST', `/games/${game.id}/organizers/invite`, undefined, cookieHeader(owner))
    assert.equal(fourth.status, 409)

    const firstRemoval = await request(
      'DELETE',
      `/games/${game.id}/organizers/${organizers.body[0].id}`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(firstRemoval.status, 200)
    const lastRemoval = await request(
      'DELETE',
      `/games/${game.id}/organizers/${organizers.body[1].id}`,
      undefined,
      cookieHeader(session),
    )
    assert.equal(lastRemoval.status, 200)
    const guard = await request(
      'DELETE',
      `/games/${game.id}/organizers/${third.body.id}`,
      undefined,
      cookieHeader(session),
    )
    assert.equal(guard.status, 409)
  })

  it('управляет вопросами, сообщениями, организаторами и поддоменами', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Управление', cookieHeader(owner))
    const people = await addParticipants(game.id, ['Аня', 'Борис'], cookieHeader(owner))
    const session = await request('POST', '/auth/session', {})

    const question = await request(
      'POST',
      `/games/${game.id}/questions`,
      {
        title: 'Что подарить?',
        type: 'single',
        required: true,
      },
      cookieHeader(owner),
    )
    assert.equal(question.status, 201)
    const updated = await request(
      'PATCH',
      `/games/${game.id}/questions/${question.body.id}`,
      { title: 'Идея подарка' },
      cookieHeader(owner),
    )
    assert.equal(updated.body.title, 'Идея подарка')
    const deleted = await request(
      'DELETE',
      `/games/${game.id}/questions/${question.body.id}`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(deleted.status, 200)

    const message = await request(
      'POST',
      `/games/${game.id}/messages`,
      { body: 'Напоминание', toId: people[1].id },
      cookieHeader(owner),
    )
    assert.equal(message.status, 201)
    const messages = await request('GET', `/games/${game.id}/messages`, undefined, cookieHeader(owner))
    assert.equal(messages.body.length, 1)

    const organizer = await request(
      'POST',
      `/games/${game.id}/organizers`,
      { token: session.body.user.token },
      cookieHeader(owner),
    )
    assert.equal(organizer.status, 201)
    const organizers = await request('GET', `/games/${game.id}/organizers`, undefined, cookieHeader(owner))
    assert.equal(organizers.body.length, 2)

    const tenant = await request(
      'POST',
      '/tenants',
      { slug: 'company', gameId: game.id, domain: 'santa.local' },
      cookieHeader(owner),
    )
    assert.equal(tenant.status, 201)
    const resolved = await request('GET', '/tenants/company')
    assert.equal(resolved.body.game.title, game.title)
    const current = await request('GET', '/tenants/current')
    assert.equal(current.body.tenant, null)

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
    ).run(current.id, boris.body.user.token, anna.body.user.token)

    const blocked = await request('POST', `/games/${current.id}/draw`, undefined, cookieHeader(anna))
    assert.equal(blocked.status, 409)
    assert.match(blocked.body.error.message, /ограничениями/)
  })

  it('ведёт прогресс и отправляет массовые напоминания', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Прогресс', cookieHeader(owner))
    const people = await addParticipants(game.id, ['Аня', 'Борис'], cookieHeader(owner))
    await request(
      'PATCH',
      `/games/${game.id}/participants/${people[0].id}`,
      { email: 'anya@example.com' },
      cookieHeader(owner),
    )

    const before = await request('GET', `/games/${game.id}`, undefined, cookieHeader(owner))
    assert.equal(before.body.progress.sent, 0)
    assert.equal(before.body.progress.received, 0)

    const sent = await request(
      'POST',
      `/games/${game.id}/participants/${people[0].id}/gift-sent`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(sent.status, 200)
    const received = await request(
      'POST',
      `/games/${game.id}/participants/${people[0].id}/gift-received`,
      undefined,
      cookieHeader(owner),
    )
    assert.equal(received.status, 200)

    const after = await request('GET', `/games/${game.id}`, undefined, cookieHeader(owner))
    assert.equal(after.body.progress.sent, 50)
    assert.equal(after.body.progress.received, 50)

    const reminder = await request(
      'POST',
      `/games/${game.id}/reminders`,
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
      `/games/${game.id}/reminders`,
      { body: 'Не забудьте карточку', recipientIds: [people[0].id, people[1].id] },
      cookieHeader(owner),
    )
    assert.equal(duplicate.status, 409)
    assert.match(duplicate.body.error.message, /уже отправлено/)

    const reminders = await request('GET', `/games/${game.id}/reminders`, undefined, cookieHeader(owner))
    assert.equal(reminders.body.length, 2)
  })

  it('проверяет права организаторов', async () => {
    const owner = await request('POST', '/auth/session', {})
    const outsider = await request('POST', '/auth/session', {})
    const game = await createGame('Права доступа', cookieHeader(owner))

    const allowed = await request(
      'POST',
      `/games/${game.id}/participants`,
      { name: 'Свой участник' },
      cookieHeader(owner),
    )
    assert.equal(allowed.status, 201)

    const denied = await request(
      'POST',
      `/games/${game.id}/participants`,
      { name: 'Чужой участник' },
      cookieHeader(outsider),
    )
    assert.equal(denied.status, 403)
    assert.match(denied.body.error.message, /организатор/)

    const anonymous = await request('POST', `/games/${game.id}/participants`, {
      name: 'Без сессии',
    })
    assert.equal(anonymous.status, 403)
  })

  it('записывает автора событий в историю', async () => {
    const owner = await request('POST', '/auth/session', {})
    const game = await createGame('Autor', cookieHeader(owner))
    const response = await request('GET', `/games/${game.id}`, undefined, cookieHeader(owner))
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
})
