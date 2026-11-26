import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db } from '../db.js'
import { HttpError, fail } from '../http-error.js'
import { rateLimit } from '../middlewares/rateLimit.js'
import {
  inviteTokenFromRequest,
  isOrganizer,
  participantByInvite,
  requireGameAccess,
  requireOrganizer,
  requireParticipantAccess,
  requireQuestionAccess,
} from '../permissions.js'
import { gamesRepository } from '../repositories/games.js'
import { drawPairs } from '../services/draw.js'
import { trackMetric } from '../services/metrics.js'
import { schemas, validateBody } from '../validation.js'

export const gamesRouter = Router()

function getGame(id) {
  const game = gamesRepository.findById(id)
  if (!game) fail(404, 'Игра не найдена')
  return game
}

function resolveGameId(raw) {
  const value = String(raw)
  const game = /^\d+$/.test(value) ? gamesRepository.findById(Number(value)) : gamesRepository.findByToken(value)
  if (!game) fail(404, 'Игра не найдена')
  return game.id
}

function loadGame(req) {
  const id = resolveGameId(req.params.id)
  requireGameAccess(req, id)
  return id
}

function loadManagedGame(req) {
  const id = loadGame(req)
  requireOrganizer(id, req.user)
  return id
}

function inviteToken() {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

function domainScheme(domain) {
  return /^(localhost|127\.0\.0\.1)(:|$)/.test(domain) ? 'http' : 'https'
}

function appBaseUrl() {
  const domain = cleanDomain(process.env.DOMAIN_NAME || process.env.DOMAIN)
  const configured = String(process.env.APP_URL || process.env.app_url || '')
    .trim()
    .replace(/\$\{DOMAIN_NAME\}/g, domain)
    .replace(/\$\{DOMAIN\}/g, domain)
    .replace(/\/+$/, '')
  if (configured) return configured
  return domain ? `${domainScheme(domain)}://${domain}` : ''
}

function publicLink(req, path) {
  return `${appBaseUrl()}${path}`
}

function parseOptions(raw) {
  if (raw == null || raw === '') return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function serializeQuestion(question) {
  return { ...question, options: parseOptions(question.options) }
}

function normalizeOptions(type, options) {
  if (!['single', 'multi'].includes(type)) return null
  const cleaned = [...new Set((options ?? []).map((item) => String(item).trim()).filter(Boolean))]
  if (!cleaned.length) fail(400, 'Для вопросов с выбором нужны варианты')
  return JSON.stringify(cleaned)
}

function addNotification(gameId, participantId, payload, kind = 'card_updated') {
  db.prepare(
    `
    INSERT INTO notifications (game_id, participant_id, kind, payload) VALUES (?, ?, ?, ?)
  `,
  ).run(gameId, participantId, kind, JSON.stringify(payload))
}

function notifyParticipants(gameId, kind, payload) {
  const participants = db.prepare('SELECT id FROM participants WHERE game_id = ?').all(gameId)
  for (const participant of participants) addNotification(gameId, participant.id, payload, kind)
}

function addEvent(gameId, kind, text, actor = null) {
  db.prepare('INSERT INTO events (game_id, kind, text, actor) VALUES (?, ?, ?, ?)').run(
    gameId,
    kind,
    text,
    actor === null || actor === undefined ? null : String(actor),
  )
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0
}

function gameProgress(gameId) {
  const participants = db
    .prepare('SELECT id, user_id, gift_sent_at, gift_received_at FROM participants WHERE game_id = ?')
    .all(gameId)
  const answered = db
    .prepare(
      `
      SELECT DISTINCT answers.participant_id
      FROM answers
      JOIN questions ON questions.id = answers.question_id
      WHERE questions.game_id = ?
    `,
    )
    .all(gameId).length
  const pairs = db.prepare('SELECT revealed_at FROM pairs WHERE game_id = ?').all(gameId)
  const total = participants.length
  return {
    joined: percent(participants.filter((person) => person.user_id).length, total),
    filled: percent(answered, total),
    learned: percent(pairs.filter((pair) => pair.revealed_at).length, pairs.length),
    sent: percent(participants.filter((person) => person.gift_sent_at).length, total),
    received: percent(participants.filter((person) => person.gift_received_at).length, total),
  }
}

function pastPairsFor(gameId) {
  const identities = db
    .prepare(
      `
      SELECT participants.id,
        COALESCE(participants.identity_token, users.token, participants.invite_token) AS identity
      FROM participants
      LEFT JOIN users ON users.id = participants.user_id
      WHERE participants.game_id = ?
    `,
    )
    .all(gameId)
  const idsByToken = new Map(identities.map((person) => [person.identity, person.id]))
  return new Set(
    db
      .prepare('SELECT from_token, to_token FROM past_pairs WHERE game_id = ?')
      .all(gameId)
      .map((pair) => `${idsByToken.get(pair.from_token)}:${idsByToken.get(pair.to_token)}`)
      .filter((value) => !value.includes('undefined')),
  )
}

function parseChatToId(req) {
  const raw = req.method === 'GET' ? req.query?.toId : req.body?.toId
  if (raw === undefined || raw === null || raw === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) fail(400, 'Некорректный получатель')
  return value
}

function chatCounterparty(gameId, participantId, requestedToId) {
  const revealedPairs = db
    .prepare(
      `
      SELECT from_id, to_id FROM pairs
      WHERE game_id = ? AND (from_id = ? OR to_id = ?) AND revealed_at IS NOT NULL
      ORDER BY id
    `,
    )
    .all(gameId, participantId, participantId)

  if (requestedToId !== null) {
    const match = revealedPairs.find((pair) => pair.from_id === requestedToId || pair.to_id === requestedToId)
    if (!match) fail(403, 'Нет доступа к этому чату')
    return requestedToId
  }

  if (revealedPairs.length) {
    const outgoing = revealedPairs.find((pair) => pair.from_id === participantId)
    const incoming = revealedPairs.find((pair) => pair.to_id === participantId)
    const pair = outgoing ?? incoming
    return pair.from_id === participantId ? pair.to_id : pair.from_id
  }

  const anyPair = db
    .prepare('SELECT 1 FROM pairs WHERE game_id = ? AND (from_id = ? OR to_id = ?) LIMIT 1')
    .get(gameId, participantId, participantId)
  if (!anyPair) fail(403, 'У вас ещё нет пары')
  fail(403, 'Пара ещё не раскрыта')
}

function validateAnswer(question, value) {
  if (value === '' || value == null) return
  if (question.type === 'number' && Number.isNaN(Number(value))) {
    fail(400, `Вопрос «${question.title}» требует число`)
  }
  if (question.type === 'boolean' && !['да', 'нет', 'true', 'false', '1', '0'].includes(String(value).toLowerCase())) {
    fail(400, `Вопрос «${question.title}» требует да/нет`)
  }
  const options = parseOptions(question.options)
  if (question.type === 'single') {
    if (!options?.includes(String(value))) fail(400, `Недопустимый вариант для вопроса «${question.title}»`)
  }
  if (question.type === 'multi') {
    const selected = String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (!selected.length || selected.some((item) => !options?.includes(item))) {
      fail(400, `Недопустимый вариант для вопроса «${question.title}»`)
    }
  }
}

const reminderRateLimit = rateLimit({ name: 'reminder', windowMs: 60_000, max: 10 })
const drawRateLimit = rateLimit({
  name: 'draw',
  windowMs: 60_000,
  max: 10,
  key: (req) => `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.params.id ?? ''}`,
})
const chatRateLimit = rateLimit({
  name: 'chat',
  windowMs: 60_000,
  max: 30,
  key: (req) => {
    const token = inviteTokenFromRequest(req)
    return token ? `invite:${token}` : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`
  },
})
const createGameRateLimit = rateLimit({ name: 'game-create', windowMs: 60_000, max: 15 })
const selfJoinRateLimit = rateLimit({ name: 'game-join', windowMs: 60_000, max: 15 })
const organizerActionRateLimit = rateLimit({ name: 'organizer-action', windowMs: 60_000, max: 20 })
const notificationRateLimit = rateLimit({
  name: 'notifications',
  windowMs: 60_000,
  max: 60,
  key: (req) => {
    const token = inviteTokenFromRequest(req)
    if (token) return `invite:${token}`
    if (req.user?.id) return `user:${req.user.id}`
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`
  },
})

gamesRouter.get('/', (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')
  res.json(gamesRepository.listForUser(req.user.id).map(({ token: _token, ...game }) => game))
})

gamesRouter.post('/', createGameRateLimit, validateBody(schemas.createGame), (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')
  const { title, budget, exchangeDate, rules, format, themeId } = req.body
  const theme = db.prepare('SELECT id FROM themes WHERE id = ?').get(themeId)
  if (!theme) fail(400, 'Неизвестная тема оформления')

  const token = randomUUID()
  const returning = Boolean(db.prepare('SELECT 1 FROM organizers WHERE user_id = ? LIMIT 1').get(req.user.id))
  const result = db
    .prepare(
      `
      INSERT INTO games (token, title, budget, exchange_date, rules, format, theme_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(token, title, budget, exchangeDate, rules, format, themeId)

  const id = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO organizers (game_id, user_id, role) VALUES (?, ?, ?)').run(id, req.user.id, 'owner')
  addEvent(id, 'settings', 'Игра создана', req.user.id)
  trackMetric('game_created', { gameId: id, userId: req.user.id })
  if (returning) trackMetric('organizer_return', { gameId: id, userId: req.user.id })
  res.status(201).json(getGame(id))
})

gamesRouter.get('/:id', (req, res) => {
  const id = loadGame(req)
  const game = getGame(id)
  const canManage = isOrganizer(id, req.user)
  const participants = db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id)

  res.json({
    game,
    canManage,
    progress: gameProgress(id),
    pastPairsCount: canManage
      ? db.prepare('SELECT COUNT(*) AS total FROM past_pairs WHERE game_id = ?').get(id).total
      : 0,
    participants: canManage
      ? participants
      : participants.map(({ id: participantId, name, filled, gift_sent_at, gift_received_at }) => ({
          id: participantId,
          name,
          filled,
          gift_sent_at,
          gift_received_at,
        })),
    questions: db
      .prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY position, id')
      .all(id)
      .map(serializeQuestion),
    exclusions: canManage ? db.prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?').all(id) : [],
    pairs: canManage ? db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id) : [],
    events: canManage ? db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY id DESC').all(id) : [],
  })
})

gamesRouter.patch('/:id', validateBody(schemas.updateGame), (req, res) => {
  const id = loadManagedGame(req)
  const game = getGame(id)
  if (req.body.themeId !== undefined) {
    const theme = db.prepare('SELECT id FROM themes WHERE id = ?').get(req.body.themeId)
    if (!theme) fail(400, 'Неизвестная тема оформления')
  }

  const next = {
    title: req.body.title ?? game.title,
    budget: req.body.budget ?? game.budget ?? '',
    exchange_date: req.body.exchangeDate ?? game.exchange_date ?? '',
    rules: req.body.rules ?? game.rules ?? '',
    format: req.body.format ?? game.format ?? '',
    theme_id: req.body.themeId ?? game.theme_id,
  }

  db.prepare(
    `
    UPDATE games
    SET title = ?, budget = ?, exchange_date = ?, rules = ?, format = ?, theme_id = ?
    WHERE id = ?
  `,
  ).run(next.title, next.budget, next.exchange_date, next.rules, next.format, next.theme_id, id)
  addEvent(id, 'settings', 'Настройки игры обновлены', req.user.id)
  res.json(getGame(id))
})

gamesRouter.post('/:id/participants', validateBody(schemas.participant), (req, res) => {
  const id = loadManagedGame(req)
  const name = req.body.name

  let result
  try {
    result = db
      .prepare('INSERT INTO participants (game_id, name, invite_token, identity_token) VALUES (?, ?, ?, ?)')
      .run(id, name, inviteToken(), randomUUID())
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Участник с таким именем уже есть')
    throw error
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid)
  addEvent(id, 'join', `${name} присоединился к игре`, req.user.id)
  trackMetric('participant_invited', { gameId: id, userId: req.user.id })
  res.status(201).json(participant)
})

gamesRouter.get('/:id/participants', (req, res) => {
  const id = loadGame(req)
  const participants = db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id)
  if (isOrganizer(id, req.user)) {
    res.json(participants)
    return
  }
  res.json(
    participants.map(({ id: participantId, name, filled, gift_sent_at, gift_received_at }) => ({
      id: participantId,
      name,
      filled,
      gift_sent_at,
      gift_received_at,
    })),
  )
})

gamesRouter.post('/:id/participants/bulk', validateBody(schemas.participantBulk), (req, res) => {
  const id = loadManagedGame(req)
  const seen = new Set()
  const names = req.body.names
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase('ru')
      if (!name || seen.has(key)) return false
      seen.add(key)
      return true
    })
  if (!names.length) fail(400, 'Список имён пуст')

  const insert = db.prepare(`
    INSERT OR IGNORE INTO participants (game_id, name, invite_token, identity_token) VALUES (?, ?, ?, ?)
  `)
  let added = 0
  db.transaction(() => {
    for (const name of names) added += insert.run(id, name, inviteToken(), randomUUID()).changes
  })()
  addEvent(id, 'join', `Добавлено участников: ${added}`, req.user.id)
  for (let index = 0; index < added; index += 1) {
    trackMetric('participant_invited', { gameId: id, userId: req.user.id })
  }
  res.status(201).json({
    added,
    participants: db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id),
  })
})

gamesRouter.post('/:id/join', selfJoinRateLimit, validateBody(schemas.participant), (req, res) => {
  const id = loadGame(req)
  const name = req.body.name
  const normalizedName = name.toLocaleLowerCase('ru')
  const duplicate = db
    .prepare('SELECT name FROM participants WHERE game_id = ?')
    .all(id)
    .some((person) => person.name.toLocaleLowerCase('ru') === normalizedName)
  if (duplicate) fail(409, 'Участник с таким именем уже есть')

  const token = inviteToken()
  let result
  try {
    result = db
      .prepare('INSERT INTO participants (game_id, name, invite_token, identity_token) VALUES (?, ?, ?, ?)')
      .run(id, name, token, randomUUID())
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Участник с таким именем уже есть')
    throw error
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid)
  addEvent(id, 'join', `${name} присоединился к игре`, req.user?.id ?? name)
  trackMetric('participant_invited', { gameId: id, userId: req.user?.id ?? null })
  res.status(201).json({
    participant,
    inviteToken: token,
    url: publicLink(req, `/join/${token}`),
  })
})

gamesRouter.patch('/:id/participants/:participantId', validateBody(schemas.participantUpdate), (req, res) => {
  const id = loadManagedGame(req)
  const participantId = Number(req.params.participantId)
  const participant = db.prepare('SELECT * FROM participants WHERE id = ? AND game_id = ?').get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  const value = (key) => (req.body[key] === undefined ? participant[key] : req.body[key])
  try {
    db.prepare(
      `
        UPDATE participants
        SET name = ?, email = ?, wishlist = ?, address = ?, notes = ?, preferred = ?
        WHERE id = ?
      `,
    ).run(
      value('name'),
      value('email'),
      value('wishlist'),
      value('address'),
      value('notes'),
      value('preferred'),
      participantId,
    )
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Участник с таким именем уже есть')
    throw error
  }
  const updated = db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId)
  addNotification(id, participantId, { text: 'Карточка участника обновлена' }, 'card_updated')
  res.json(updated)
})

function markGift(kind) {
  return (req, res) => {
    const id = loadManagedGame(req)
    const participantId = Number(req.params.participantId)
    const participant = db.prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?').get(participantId, id)
    if (!participant) fail(404, 'Участник не найден')
    const column = kind === 'sent' ? 'gift_sent_at' : 'gift_received_at'
    db.prepare(`UPDATE participants SET ${column} = datetime('now') WHERE id = ?`).run(participantId)
    addEvent(id, 'settings', kind === 'sent' ? 'Подарок отправлен' : 'Подарок получен', req.user.id)
    if (kind === 'sent') trackMetric('gift_sent', { gameId: id, userId: req.user.id })
    res.json({ ok: true })
  }
}

gamesRouter.post('/:id/participants/:participantId/gift-sent', markGift('sent'))
gamesRouter.post('/:id/participants/:participantId/gift-received', markGift('received'))

gamesRouter.delete('/:id/participants/:participantId', (req, res) => {
  const id = loadManagedGame(req)
  const participantId = Number(req.params.participantId)
  const participant = db.prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?').get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  const remaining = db
    .prepare('SELECT id FROM participants WHERE game_id = ? AND id <> ? ORDER BY id')
    .all(id, participantId)
    .map((person) => person.id)
  const remainingSet = new Set(remaining)
  const exclusions = new Set(
    db
      .prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?')
      .all(id)
      .filter((item) => remainingSet.has(item.from_id) && remainingSet.has(item.to_id))
      .map((item) => `${item.from_id}:${item.to_id}`),
  )

  const past = new Set(
    [...pastPairsFor(id)]
      .map((value) => value.split(':').map(Number))
      .filter(([from, to]) => remainingSet.has(from) && remainingSet.has(to))
      .map(([from, to]) => `${from}:${to}`),
  )

  db.transaction(() => {
    db.prepare('DELETE FROM participants WHERE id = ?').run(participantId)
    db.prepare('DELETE FROM pairs WHERE game_id = ?').run(id)
    if (remaining.length >= 2) {
      const solution = drawPairs({ ids: remaining, exclusions, past })
      if (solution) {
        const insert = db.prepare(`
          INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, 0)
        `)
        for (const [from, to] of solution) insert.run(id, from, to)
      } else {
        addEvent(id, 'draw', 'Не удалось перестроить пары после удаления участника', req.user.id)
      }
    }
    addEvent(id, 'settings', 'Участник удалён, пары перестроены', req.user.id)
    notifyParticipants(id, 'draw_changed', { text: 'Состав участников изменён, пары перестроены' })
  })()

  res.json({
    ok: true,
    pairs: db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id),
  })
})

gamesRouter.get('/:id/invite', (req, res) => {
  const id = loadManagedGame(req)
  const game = getGame(id)
  res.json({
    commonUrl: publicLink(req, `/game/${game.token}`),
    participants: db
      .prepare('SELECT id, name, invite_token, filled FROM participants WHERE game_id = ? ORDER BY id')
      .all(id)
      .map((person) => ({
        ...person,
        url: publicLink(req, `/join/${person.invite_token}`),
      })),
  })
})

gamesRouter.post('/:id/past-pairs/import', validateBody(schemas.pastPairsImport), (req, res) => {
  const id = loadManagedGame(req)
  const pastGameId = Number(req.body.pastGameId)
  getGame(pastGameId)
  const belongs = db
    .prepare(
      `
        SELECT 1 AS ok FROM participants WHERE game_id = ? AND user_id = ?
        UNION
        SELECT 1 AS ok FROM organizers WHERE game_id = ? AND user_id = ?
      `,
    )
    .get(pastGameId, req.user.id, pastGameId, req.user.id)
  if (!belongs) fail(403, 'Прошлая игра недоступна для импорта')

  const rows = db
    .prepare(
      `
        SELECT
          COALESCE(fromParticipant.identity_token, fromUser.token, fromParticipant.invite_token) AS from_token,
          COALESCE(toParticipant.identity_token, toUser.token, toParticipant.invite_token) AS to_token,
          COALESCE(g.exchange_date, datetime('now')) AS played_at
        FROM pairs
        JOIN participants fromParticipant ON fromParticipant.id = pairs.from_id
        JOIN participants toParticipant ON toParticipant.id = pairs.to_id
        LEFT JOIN users fromUser ON fromUser.id = fromParticipant.user_id
        LEFT JOIN users toUser ON toUser.id = toParticipant.user_id
        JOIN games g ON g.id = pairs.game_id
        WHERE pairs.game_id = ?
      `,
    )
    .all(pastGameId)
  if (!rows.length) fail(400, 'В прошлой игре нет распределённых пар')

  const insert = db.prepare(`
      INSERT OR IGNORE INTO past_pairs (game_id, from_token, to_token, played_at)
      VALUES (?, ?, ?, ?)
    `)
  const result = db.transaction(() => {
    let imported = 0
    for (const row of rows) {
      imported += insert.run(id, row.from_token, row.to_token, row.played_at).changes
    }
    return imported
  })()
  addEvent(id, 'settings', `Импортировано прошлых пар: ${result}`, req.user.id)
  res.status(201).json({ imported: result, total: rows.length })
})

gamesRouter.post('/:id/exclusions', validateBody(schemas.exclusion), (req, res) => {
  const id = loadManagedGame(req)
  const { fromId, toId } = req.body
  const participants = db.prepare('SELECT id FROM participants WHERE game_id = ?').all(id)
  const ids = new Set(participants.map((person) => person.id))
  if (!ids.has(fromId) || !ids.has(toId) || fromId === toId) fail(400, 'Некорректная пара исключения')

  db.prepare('INSERT OR IGNORE INTO exclusions (game_id, from_id, to_id) VALUES (?, ?, ?)').run(id, fromId, toId)
  res.status(201).json({ fromId, toId })
})

gamesRouter.get('/:id/exclusions', (req, res) => {
  const id = loadManagedGame(req)
  res.json(db.prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?').all(id))
})

gamesRouter.delete('/:id/exclusions/:fromId/:toId', (req, res) => {
  const id = loadManagedGame(req)
  db.prepare('DELETE FROM exclusions WHERE game_id = ? AND from_id = ? AND to_id = ?').run(
    id,
    Number(req.params.fromId),
    Number(req.params.toId),
  )
  res.json({ ok: true })
})

gamesRouter.post('/:id/draw', drawRateLimit, (req, res) => {
  const id = loadManagedGame(req)
  const participants = db.prepare('SELECT id, name FROM participants WHERE game_id = ? ORDER BY id').all(id)
  if (participants.length < 2) fail(400, 'Для жеребьёвки нужно минимум два участника')

  const ids = participants.map((person) => person.id)
  const exclusions = new Set(
    db
      .prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?')
      .all(id)
      .map((item) => `${item.from_id}:${item.to_id}`),
  )
  const manual = new Map(
    db
      .prepare('SELECT from_id, to_id FROM pairs WHERE game_id = ? AND manual = 1')
      .all(id)
      .map((item) => [item.from_id, item.to_id]),
  )

  const solution = drawPairs({ ids, exclusions, manual, past: pastPairsFor(id) })
  if (!solution) fail(409, 'Не удалось распределить пары с текущими ограничениями')

  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ?').run(id)
    const insert = db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, ?)')
    for (const [from, to] of solution) insert.run(id, from, to, manual.has(from) ? 1 : 0)
    addEvent(id, 'draw', 'Проведена жеребьёвка', req.user.id)
    trackMetric('draw_completed', { gameId: id, userId: req.user.id })
    notifyParticipants(id, 'draw_changed', { text: 'Распределение пар обновлено' })
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.post('/:id/draw/new', drawRateLimit, (req, res) => {
  const id = loadManagedGame(req)
  const participants = db.prepare('SELECT id FROM participants WHERE game_id = ? ORDER BY id').all(id)
  const pairs = db.prepare('SELECT from_id, to_id FROM pairs WHERE game_id = ?').all(id)
  const paired = new Set(pairs.flatMap((pair) => [pair.from_id, pair.to_id]))
  const pending = participants.map((person) => person.id).filter((personId) => !paired.has(personId))
  if (pending.length < 2) fail(400, 'Нет двух участников без пары')

  const pendingSet = new Set(pending)
  const exclusions = new Set(
    db
      .prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?')
      .all(id)
      .filter((item) => pendingSet.has(item.from_id) && pendingSet.has(item.to_id))
      .map((item) => `${item.from_id}:${item.to_id}`),
  )
  const manual = new Map(
    db
      .prepare('SELECT from_id, to_id FROM pairs WHERE game_id = ? AND manual = 1')
      .all(id)
      .filter((item) => pendingSet.has(item.from_id) && pendingSet.has(item.to_id))
      .map((item) => [item.from_id, item.to_id]),
  )

  const pendingIds = new Set(pending)
  const past = new Set(
    [...pastPairsFor(id)]
      .map((value) => value.split(':'))
      .filter(([from, to]) => pendingIds.has(Number(from)) && pendingIds.has(Number(to)))
      .map(([from, to]) => `${from}:${to}`),
  )
  const solution = drawPairs({ ids: pending, exclusions, manual, past })
  if (!solution) fail(409, 'Не удалось распределить пары для новых участников')

  db.transaction(() => {
    const insert = db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, ?)')
    for (const [from, to] of solution) insert.run(id, from, to, manual.has(from) ? 1 : 0)
    addEvent(id, 'draw', `Дополнительно распределено участников: ${pending.length}`, req.user.id)
    trackMetric('draw_completed', { gameId: id, userId: req.user.id })
    notifyParticipants(id, 'draw_changed', { text: 'Распределение пар обновлено' })
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.get('/:id/my-pair', (req, res) => {
  const id = resolveGameId(req.params.id)
  const participant = participantByInvite(req, id)
  const pair = db
    .prepare(
      `
      SELECT pairs.from_id, pairs.to_id, pairs.revealed_at, sender.name AS from_name, receiver.name AS to_name
      FROM pairs
      JOIN participants sender ON sender.id = pairs.from_id
      JOIN participants receiver ON receiver.id = pairs.to_id
      WHERE pairs.game_id = ? AND (pairs.from_id = ? OR pairs.to_id = ?)
      ORDER BY pairs.id
      LIMIT 1
    `,
    )
    .get(id, participant.id, participant.id)

  if (!pair || !pair.revealed_at) {
    res.json({ revealed_at: null })
    return
  }

  res.json(pair)
})

gamesRouter.get('/:id/pairs', (req, res) => {
  const id = loadManagedGame(req)
  res.json(
    db
      .prepare(
        `
        SELECT pairs.*, sender.name AS from_name, receiver.name AS to_name
        FROM pairs
        JOIN participants sender ON sender.id = pairs.from_id
        JOIN participants receiver ON receiver.id = pairs.to_id
        WHERE pairs.game_id = ?
        ORDER BY pairs.from_id
      `,
      )
      .all(id),
  )
})

gamesRouter.post('/:id/pairs/reset', drawRateLimit, (req, res) => {
  const id = loadManagedGame(req)
  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ?').run(id)
    addEvent(id, 'settings', 'Распределение пар сброшено', req.user.id)
    notifyParticipants(id, 'draw_changed', { text: 'Распределение пар сброшено' })
  })()
  res.json([])
})

gamesRouter.post('/:id/pairs', validateBody(schemas.pair), (req, res) => {
  const id = loadManagedGame(req)
  const { fromId, toId } = req.body
  const participantIds = new Set(
    db
      .prepare('SELECT id FROM participants WHERE game_id = ?')
      .all(id)
      .map((person) => person.id),
  )
  if (!participantIds.has(fromId) || !participantIds.has(toId) || fromId === toId) {
    fail(400, 'Некорректное назначение пары')
  }
  if (db.prepare('SELECT 1 FROM exclusions WHERE game_id = ? AND from_id = ? AND to_id = ?').get(id, fromId, toId)) {
    fail(409, 'Эта пара исключена')
  }

  const current = db.prepare('SELECT to_id FROM pairs WHERE game_id = ? AND from_id = ?').get(id, fromId)
  const other = db
    .prepare('SELECT from_id FROM pairs WHERE game_id = ? AND to_id = ? AND from_id <> ?')
    .get(id, toId, fromId)

  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ? AND from_id = ?').run(id, fromId)
    if (other) db.prepare('DELETE FROM pairs WHERE game_id = ? AND from_id = ?').run(id, other.from_id)

    db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, 1)').run(id, fromId, toId)
    if (other && current) {
      db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, 1)').run(
        id,
        other.from_id,
        current.to_id,
      )
    }
    addEvent(id, 'settings', 'Распределение пар изменено вручную', req.user.id)
    notifyParticipants(id, 'draw_changed', { text: 'Распределение пар изменено' })
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.post('/:id/reveal', validateBody(schemas.reveal), (req, res) => {
  const id = loadManagedGame(req)
  const fromId = req.body.fromId
  const pair = db.prepare('SELECT * FROM pairs WHERE game_id = ? AND from_id = ?').get(id, fromId)
  if (!pair) fail(404, 'Пара не найдена')
  db.prepare(`UPDATE pairs SET revealed_at = datetime('now') WHERE id = ?`).run(pair.id)
  addEvent(id, 'draw', 'Организатор раскрыл пару', req.user.id)
  addNotification(id, pair.from_id, { text: 'Ваша пара раскрыта' }, 'pair_revealed')
  addNotification(id, pair.to_id, { text: 'Ваша пара раскрыта' }, 'pair_revealed')
  res.json(db.prepare('SELECT * FROM pairs WHERE id = ?').get(pair.id))
})

gamesRouter.get('/:id/events', (req, res) => {
  const id = loadManagedGame(req)
  res.json(db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY id DESC').all(id))
})

gamesRouter.get('/:id/notifications', notificationRateLimit, (req, res) => {
  const id = resolveGameId(req.params.id)
  if (isOrganizer(id, req.user)) {
    res.json(
      db
        .prepare(
          `
          SELECT n.id, n.kind, n.payload, n.sent_at, n.created_at, p.name AS participant_name
          FROM notifications n
          LEFT JOIN participants p ON p.id = n.participant_id
          WHERE n.game_id = ?
          ORDER BY n.id DESC
        `,
        )
        .all(id),
    )
    return
  }
  const participant = participantByInvite(req, id)
  db.transaction(() => {
    db.prepare(
      `
      UPDATE notifications
      SET sent_at = COALESCE(sent_at, datetime('now'))
      WHERE game_id = ? AND participant_id = ? AND sent_at IS NULL
    `,
    ).run(id, participant.id)
  })()
  res.json(
    db
      .prepare(
        `
        SELECT n.id, n.kind, n.payload, n.sent_at, n.created_at
        FROM notifications n
        WHERE n.game_id = ? AND n.participant_id = ?
        ORDER BY n.id DESC
      `,
      )
      .all(id, participant.id),
  )
})

gamesRouter.get('/:id/questions', (req, res) => {
  const id = resolveGameId(req.params.id)
  requireQuestionAccess(req, id)
  res.json(db.prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY position, id').all(id).map(serializeQuestion))
})

gamesRouter.post('/:id/questions', validateBody(schemas.questionCreate), (req, res) => {
  const id = loadManagedGame(req)
  const { title, hint, type, required, position } = req.body
  const count = db.prepare('SELECT COUNT(*) AS count FROM questions WHERE game_id = ?').get(id).count
  if (count >= 10) fail(400, 'Можно добавить не больше 10 вопросов')

  const options = normalizeOptions(type, req.body.options)
  const result = db
    .prepare(
      `
      INSERT INTO questions (game_id, title, hint, type, options, required, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(id, title, hint, type, options, required ? 1 : 0, position)
  addEvent(id, 'settings', `Добавлен вопрос «${title}»`, req.user.id)
  res
    .status(201)
    .json(serializeQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid)))
})

gamesRouter.patch('/:id/questions/:questionId', validateBody(schemas.questionUpdate), (req, res) => {
  const id = loadManagedGame(req)
  const questionId = Number(req.params.questionId)
  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND game_id = ?').get(questionId, id)
  if (!question) fail(404, 'Вопрос не найден')

  const title = req.body.title === undefined ? question.title : req.body.title
  const hint = req.body.hint === undefined ? question.hint : req.body.hint
  const type = req.body.type === undefined ? question.type : req.body.type
  const required = req.body.required === undefined ? question.required : req.body.required ? 1 : 0
  const position = req.body.position === undefined ? question.position : req.body.position
  const options =
    req.body.options === undefined
      ? ['single', 'multi'].includes(type)
        ? question.options
        : null
      : normalizeOptions(type, req.body.options)
  if (['single', 'multi'].includes(type) && !parseOptions(options)?.length) {
    fail(400, 'Для вопросов с выбором нужны варианты')
  }

  db.prepare(
    `
    UPDATE questions SET title = ?, hint = ?, type = ?, options = ?, required = ?, position = ? WHERE id = ?
  `,
  ).run(title, hint, type, options, required, position, questionId)
  res.json(serializeQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId)))
})

gamesRouter.delete('/:id/questions/:questionId', (req, res) => {
  const id = loadManagedGame(req)
  const questionId = Number(req.params.questionId)
  const result = db.prepare('DELETE FROM questions WHERE id = ? AND game_id = ?').run(questionId, id)
  if (!result.changes) fail(404, 'Вопрос не найден')
  addEvent(id, 'settings', 'Вопрос удалён', req.user.id)
  res.json({ ok: true })
})

gamesRouter.get('/:id/answers', (req, res) => {
  const id = loadManagedGame(req)
  res.json(
    db
      .prepare(
        `
        SELECT answers.*, questions.title AS question_title, participants.name AS participant_name
        FROM answers
        JOIN questions ON questions.id = answers.question_id
        JOIN participants ON participants.id = answers.participant_id
        WHERE questions.game_id = ?
        ORDER BY questions.position, questions.id, participants.id
      `,
      )
      .all(id),
  )
})

gamesRouter.get('/:id/participants/:participantId/answers', (req, res) => {
  const id = resolveGameId(req.params.id)
  const participantId = Number(req.params.participantId)
  requireParticipantAccess(req, id, participantId)
  const participant = db.prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?').get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  res.json(
    db
      .prepare(
        `
        SELECT answers.question_id, answers.value
        FROM answers
        JOIN questions ON questions.id = answers.question_id
        WHERE answers.participant_id = ? AND questions.game_id = ?
        ORDER BY questions.position, questions.id
      `,
      )
      .all(participantId, id),
  )
})

gamesRouter.put('/:id/participants/:participantId/answers', validateBody(schemas.answersSave), (req, res) => {
  const id = resolveGameId(req.params.id)
  const participantId = Number(req.params.participantId)
  requireParticipantAccess(req, id, participantId)
  const participant = db.prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?').get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  const questions = db.prepare('SELECT * FROM questions WHERE game_id = ?').all(id)
  const allowed = new Map(questions.map((question) => [question.id, question]))
  const values = new Map()
  for (const answer of req.body.answers) {
    const question = allowed.get(answer.questionId)
    if (!question) fail(400, 'Вопрос не относится к этой игре')
    if (values.has(answer.questionId)) fail(400, 'Дублирующий ответ')
    validateAnswer(question, answer.value)
    values.set(answer.questionId, answer.value)
  }
  for (const question of questions) {
    if (question.required && !values.get(question.id)) fail(400, `Вопрос «${question.title}» обязателен`)
  }

  db.transaction(() => {
    db.prepare('DELETE FROM answers WHERE participant_id = ?').run(participantId)
    const insert = db.prepare(`
      INSERT INTO answers (question_id, participant_id, value) VALUES (?, ?, ?)
    `)
    for (const [questionId, value] of values) insert.run(questionId, participantId, value)
    addNotification(id, participantId, { text: 'Ответы на вопросы обновлены' }, 'answers_updated')
  })()

  res.json(
    db
      .prepare(
        `
        SELECT answers.question_id, answers.value
        FROM answers
        JOIN questions ON questions.id = answers.question_id
        WHERE answers.participant_id = ? AND questions.game_id = ?
        ORDER BY questions.position, questions.id
      `,
      )
      .all(participantId, id),
  )
})

gamesRouter.get('/:id/recipient-answers', (req, res) => {
  const id = resolveGameId(req.params.id)
  const participant = participantByInvite(req, id)
  const pair = db
    .prepare('SELECT to_id, revealed_at FROM pairs WHERE game_id = ? AND from_id = ?')
    .get(id, participant.id)
  if (!pair) fail(404, 'Пара не найдена')
  if (!pair.revealed_at) fail(403, 'Пара ещё не раскрыта')

  const recipient = db
    .prepare('SELECT id, name, wishlist, address, notes, preferred FROM participants WHERE id = ? AND game_id = ?')
    .get(pair.to_id, id)
  if (!recipient) fail(404, 'Участник не найден')

  const answers = db
    .prepare(
      `
      SELECT q.id AS question_id, q.title, q.hint, q.type, q.options, q.required, q.position, a.value
      FROM questions q
      LEFT JOIN answers a ON a.question_id = q.id AND a.participant_id = ?
      WHERE q.game_id = ?
      ORDER BY q.position, q.id
    `,
    )
    .all(pair.to_id, id)
    .map((row) => ({
      questionId: row.question_id,
      title: row.title,
      hint: row.hint,
      type: row.type,
      options: parseOptions(row.options),
      required: Boolean(row.required),
      position: row.position,
      value: row.value ?? '',
    }))

  res.json({ participant: recipient, answers })
})

gamesRouter.get('/:id/messages', (req, res) => {
  const id = loadManagedGame(req)
  res.json(
    db
      .prepare(
        `
      SELECT messages.*, sender.name AS from_name, receiver.name AS to_name
      FROM messages
      LEFT JOIN participants sender ON sender.id = messages.from_id
      LEFT JOIN participants receiver ON receiver.id = messages.to_id
      WHERE messages.game_id = ?
      ORDER BY messages.id DESC
    `,
      )
      .all(id),
  )
})

gamesRouter.post('/:id/messages', validateBody(schemas.message), (req, res) => {
  const id = loadManagedGame(req)
  const { body } = req.body
  const fromId = req.body.fromId ?? null
  const toId = req.body.toId ?? null
  const participantIds = new Set(
    db
      .prepare('SELECT id FROM participants WHERE game_id = ?')
      .all(id)
      .map((person) => person.id),
  )
  if (fromId !== null && !participantIds.has(fromId)) fail(400, 'Отправитель не участвует в игре')
  if (toId !== null && !participantIds.has(toId)) fail(400, 'Получатель не участвует в игре')

  const result = db
    .prepare('INSERT INTO messages (game_id, from_id, to_id, body) VALUES (?, ?, ?, ?)')
    .run(id, fromId, toId, body)
  addEvent(id, 'message', 'Отправлено сообщение', req.user.id)
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid))
})

gamesRouter.get('/:id/chat', (req, res) => {
  const id = resolveGameId(req.params.id)
  const participant = participantByInvite(req, id)
  const requestedToId = parseChatToId(req)
  const counterparty = chatCounterparty(id, participant.id, requestedToId)
  const messages = db
    .prepare(
      `
      SELECT id, body, image_url, created_at, from_id
      FROM chat_messages
      WHERE game_id = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))
      ORDER BY id
    `,
    )
    .all(id, participant.id, counterparty, counterparty, participant.id)
    .map((message) => ({
      id: message.id,
      body: message.body,
      imageUrl: message.image_url,
      mine: message.from_id === participant.id,
      createdAt: message.created_at,
    }))
  res.json(messages)
})

gamesRouter.post('/:id/chat', chatRateLimit, validateBody(schemas.chatMessage), (req, res) => {
  const id = resolveGameId(req.params.id)
  const participant = participantByInvite(req, id)
  const requestedToId = req.body.toId ?? null
  const counterparty = chatCounterparty(id, participant.id, requestedToId)
  const result = db
    .prepare('INSERT INTO chat_messages (game_id, from_id, to_id, body, image_url) VALUES (?, ?, ?, ?, ?)')
    .run(id, participant.id, counterparty, req.body.body, req.body.imageUrl ?? null)
  addNotification(id, counterparty, { text: 'Новое анонимное сообщение' }, 'chat_message')
  res.status(201).json(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid))
})

gamesRouter.get('/:id/reminders', (req, res) => {
  const id = loadManagedGame(req)
  res.json(
    db
      .prepare(
        `
      SELECT messages.*, participants.name AS participant_name
      FROM messages
      LEFT JOIN participants ON participants.id = messages.to_id
      WHERE messages.game_id = ? AND messages.from_id IS NULL
      ORDER BY messages.id DESC
    `,
      )
      .all(id),
  )
})

gamesRouter.post('/:id/reminders', reminderRateLimit, validateBody(schemas.reminder), (req, res) => {
  const id = loadManagedGame(req)
  const { body, recipientIds } = req.body
  const uniqueIds = [...new Set(recipientIds.map(Number))]
  const participants = db
    .prepare(
      `SELECT id, name, email FROM participants WHERE game_id = ? AND id IN (${uniqueIds.map(() => '?').join(',')})`,
    )
    .all(id, ...uniqueIds)
  if (participants.length !== uniqueIds.length) fail(400, 'Некоторые участники не найдены')

  const dedupeKey = createHash('sha256')
    .update(`${id}|${uniqueIds.sort((a, b) => a - b).join(',')}|${body}`)
    .digest('hex')
  const duplicate = db
    .prepare(
      `
        SELECT id FROM messages
        WHERE game_id = ? AND dedupe_key = ? AND created_at >= datetime('now', '-5 minutes')
      `,
    )
    .get(id, dedupeKey)
  if (duplicate) fail(409, 'Такое напоминание уже отправлено')

  const insert = db.prepare(`
      INSERT INTO messages (game_id, from_id, to_id, body, recipient_email, status, error, dedupe_key)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `)
  const created = db.transaction(() =>
    participants.map((person) => {
      const status = person.email ? 'sent' : 'queued'
      const error = person.email ? null : 'Email не указан'
      const result = insert.run(id, person.id, body, person.email, status, error, dedupeKey)
      return db
        .prepare(
          `
          SELECT messages.*, participants.name AS participant_name
          FROM messages JOIN participants ON participants.id = messages.to_id
          WHERE messages.id = ?
        `,
        )
        .get(result.lastInsertRowid)
    }),
  )()
  addEvent(id, 'message', `Отправлено напоминаний: ${created.length}`, req.user.id)
  res.status(201).json(created)
})

gamesRouter.get('/:id/organizers', (req, res) => {
  const id = loadManagedGame(req)
  res.json(
    db
      .prepare(
        `
      SELECT o.id, o.role, o.user_id, o.created_at, o.invited_token IS NOT NULL AS invited,
        u.email AS user_email
      FROM organizers o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.game_id = ?
      ORDER BY o.id
    `,
      )
      .all(id)
      .map((organizer) => ({
        id: organizer.id,
        role: organizer.role,
        userId: organizer.user_id,
        invited: Boolean(organizer.invited),
        status: organizer.user_id ? 'accepted' : 'pending',
        displayName:
          organizer.user_email || (organizer.user_id ? `Организатор #${organizer.user_id}` : 'Ожидает принятия'),
        createdAt: organizer.created_at,
      })),
  )
})

gamesRouter.post('/:id/organizers', organizerActionRateLimit, validateBody(schemas.organizer), (req, res) => {
  const id = loadManagedGame(req)
  const token = req.body.token
  const user = db.prepare('SELECT id FROM users WHERE token = ?').get(token)
  if (!user) fail(404, 'Пользователь не найден')

  const count = db.prepare('SELECT COUNT(*) AS total FROM organizers WHERE game_id = ?').get(id).total
  if (count >= 3) fail(409, 'Максимум три организатора')

  try {
    db.prepare('INSERT INTO organizers (game_id, user_id, role) VALUES (?, ?, ?)').run(id, user.id, 'organizer')
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Организатор уже добавлен')
    throw error
  }
  addEvent(id, 'settings', 'Добавлен организатор', req.user.id)
  res.status(201).json({ userId: user.id })
})

gamesRouter.post('/:id/organizers/invite', organizerActionRateLimit, (req, res) => {
  const id = loadManagedGame(req)
  const count = db.prepare('SELECT COUNT(*) AS total FROM organizers WHERE game_id = ?').get(id).total
  if (count >= 3) fail(409, 'Максимум три организатора')

  const token = inviteToken()
  const result = db
    .prepare(
      `
      INSERT INTO organizers (game_id, user_id, role, invited_token)
      VALUES (?, NULL, 'organizer', ?)
    `,
    )
    .run(id, token)
  addEvent(id, 'settings', 'Создано приглашение организатора', req.user.id)
  res.status(201).json({
    id: result.lastInsertRowid,
    token,
    url: publicLink(req, `/organizer/${token}`),
  })
})

gamesRouter.delete('/:id/organizers/:organizerId', organizerActionRateLimit, (req, res) => {
  const id = loadManagedGame(req)
  const organizerId = Number(req.params.organizerId)
  const organizer = db
    .prepare('SELECT id, role, user_id FROM organizers WHERE id = ? AND game_id = ?')
    .get(organizerId, id)
  if (!organizer) fail(404, 'Организатор не найден')

  const count = db.prepare('SELECT COUNT(*) AS total FROM organizers WHERE game_id = ?').get(id).total
  if (count <= 1) fail(409, 'Нельзя удалить последнего организатора')
  if (organizer.role === 'owner') {
    const accepted = db
      .prepare(
        `
        SELECT COUNT(*) AS total FROM organizers
        WHERE game_id = ? AND user_id IS NOT NULL AND id <> ?
      `,
      )
      .get(id, organizerId).total
    if (!accepted) fail(409, 'Сначала передайте управление принявшему приглашение организатору')
  }

  db.prepare('DELETE FROM organizers WHERE id = ?').run(organizerId)
  addEvent(id, 'settings', 'Организатор удалён', req.user.id)
  res.json({ ok: true })
})

gamesRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
