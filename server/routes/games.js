import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db } from '../db.js'
import { HttpError, fail } from '../http-error.js'
import { rateLimit } from '../middlewares/rateLimit.js'
import { requireOrganizer } from '../permissions.js'
import { gamesRepository } from '../repositories/games.js'
import { drawPairs } from '../services/draw.js'
import { schemas, validateBody } from '../validation.js'

export const gamesRouter = Router()

function getGame(id) {
  const game = gamesRepository.findById(id)
  if (!game) fail(404, 'Игра не найдена')
  return game
}

function resolveGameId(raw) {
  const value = String(raw)
  const game = /^\d+$/.test(value)
    ? gamesRepository.findById(Number(value))
    : gamesRepository.findByToken(value)
  if (!game) fail(404, 'Игра не найдена')
  return game.id
}

function inviteToken() {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
}

function appBaseUrl() {
  const domain = cleanDomain(process.env.DOMAIN_NAME || process.env.DOMAIN)
  const configured = String(process.env.APP_URL || process.env.app_url || '')
    .trim()
    .replace(/\$\{DOMAIN_NAME\}/g, domain)
    .replace(/\$\{DOMAIN\}/g, domain)
    .replace(/\/+$/, '')
  if (configured) return configured
  return domain ? `https://${domain}` : ''
}

function publicLink(req, path) {
  return `${appBaseUrl()}${path}`
}

function addNotification(gameId, participantId, payload) {
  db.prepare(`
    INSERT INTO notifications (game_id, participant_id, kind, payload) VALUES (?, ?, ?, ?)
  `).run(gameId, participantId, 'card_updated', JSON.stringify(payload))
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
    .prepare(`
      SELECT DISTINCT answers.participant_id
      FROM answers
      JOIN questions ON questions.id = answers.question_id
      WHERE questions.game_id = ?
    `)
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
    .prepare(`
      SELECT participants.id, COALESCE(users.token, participants.invite_token) AS identity
      FROM participants
      LEFT JOIN users ON users.id = participants.user_id
      WHERE participants.game_id = ?
    `)
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

const reminderRateLimit = rateLimit({ windowMs: 60_000, max: 10 })

gamesRouter.get('/', (_req, res) => {
  res.json(gamesRepository.list())
})

gamesRouter.post('/', validateBody(schemas.createGame), (req, res) => {
  const { title, budget, exchangeDate, rules, themeId } = req.body
  const theme = db.prepare('SELECT id FROM themes WHERE id = ?').get(themeId)
  if (!theme) fail(400, 'Неизвестная тема оформления')

  const token = randomUUID()
  const result = db
    .prepare(`
      INSERT INTO games (token, title, budget, exchange_date, rules, theme_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(token, title, budget, exchangeDate, rules, themeId)

  const id = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO organizers (game_id, user_id, role) VALUES (?, ?, ?)').run(
    id,
    req.user?.id ?? null,
    'owner',
  )
  addEvent(id, 'settings', 'Игра создана', req.user?.id ?? null)
  res.status(201).json(getGame(id))
})

gamesRouter.get('/:id', (req, res) => {
  const id = resolveGameId(req.params.id)
  const game = getGame(id)

  res.json({
    game,
    progress: gameProgress(id),
    pastPairsCount: db.prepare('SELECT COUNT(*) AS total FROM past_pairs WHERE game_id = ?').get(id).total,
    participants: db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id),
    questions: db.prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY position, id').all(id),
    exclusions: db.prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?').all(id),
    pairs: db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id),
    events: db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY id DESC').all(id),
  })
})

gamesRouter.post('/:id/participants', validateBody(schemas.participant), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const name = req.body.name

  let result
  try {
    result = db
      .prepare('INSERT INTO participants (game_id, name, invite_token) VALUES (?, ?, ?)')
      .run(id, name, inviteToken())
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Участник с таким именем уже есть')
    throw error
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid)
  addEvent(id, 'join', `${name} присоединился к игре`, name)
  res.status(201).json(participant)
})

gamesRouter.get('/:id/participants', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id))
})

gamesRouter.post('/:id/participants/bulk', validateBody(schemas.participantBulk), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
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
    INSERT OR IGNORE INTO participants (game_id, name, invite_token) VALUES (?, ?, ?)
  `)
  let added = 0
  db.transaction(() => {
    for (const name of names) added += insert.run(id, name, inviteToken()).changes
  })()
  addEvent(id, 'join', `Добавлено участников: ${added}`, req.user?.id ?? null)
  res.status(201).json({
    added,
    participants: db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id),
  })
})

gamesRouter.patch('/:id/participants/:participantId', validateBody(schemas.participantUpdate), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const participantId = Number(req.params.participantId)
  const participant = db
    .prepare('SELECT * FROM participants WHERE id = ? AND game_id = ?')
    .get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  const value = (key) => (req.body[key] === undefined ? participant[key] : req.body[key])
  try {
    db
      .prepare(`
        UPDATE participants
        SET name = ?, email = ?, wishlist = ?, address = ?, notes = ?, preferred = ?
        WHERE id = ?
      `)
      .run(
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
  addNotification(id, participantId, updated)
  res.json(updated)
})

function markGift(kind) {
  return (req, res) => {
    const id = resolveGameId(req.params.id)
    getGame(id)
    requireOrganizer(id, req.user)
    const participantId = Number(req.params.participantId)
    const participant = db
      .prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?')
      .get(participantId, id)
    if (!participant) fail(404, 'Участник не найден')
    const column = kind === 'sent' ? 'gift_sent_at' : 'gift_received_at'
    db.prepare(`UPDATE participants SET ${column} = datetime('now') WHERE id = ?`).run(participantId)
    addEvent(id, 'settings', kind === 'sent' ? 'Подарок отправлен' : 'Подарок получен', req.user?.id ?? null)
    res.json({ ok: true })
  }
}

gamesRouter.post('/:id/participants/:participantId/gift-sent', markGift('sent'))
gamesRouter.post('/:id/participants/:participantId/gift-received', markGift('received'))

gamesRouter.delete('/:id/participants/:participantId', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const participantId = Number(req.params.participantId)
  const participant = db
    .prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?')
    .get(participantId, id)
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
        addEvent(id, 'draw', 'Не удалось перестроить пары после удаления участника', req.user?.id ?? null)
      }
    }
    addEvent(id, 'settings', 'Участник удалён, пары перестроены', req.user?.id ?? null)
  })()

  res.json({
    ok: true,
    pairs: db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id),
  })
})

gamesRouter.get('/:id/invite', (req, res) => {
  const id = resolveGameId(req.params.id)
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

gamesRouter.post(
  '/:id/past-pairs/import',
  validateBody(schemas.pastPairsImport),
  (req, res) => {
    const id = resolveGameId(req.params.id)
    getGame(id)
    requireOrganizer(id, req.user)
    const pastGameId = Number(req.body.pastGameId)
    getGame(pastGameId)
    const belongs = db
      .prepare(`
        SELECT 1 AS ok FROM participants WHERE game_id = ? AND user_id = ?
        UNION
        SELECT 1 AS ok FROM organizers WHERE game_id = ? AND user_id = ?
      `)
      .get(pastGameId, req.user.id, pastGameId, req.user.id)
    if (!belongs) fail(403, 'Прошлая игра недоступна для импорта')

    const rows = db
      .prepare(`
        SELECT
          COALESCE(fromUser.token, fromParticipant.invite_token) AS from_token,
          COALESCE(toUser.token, toParticipant.invite_token) AS to_token,
          COALESCE(g.exchange_date, datetime('now')) AS played_at
        FROM pairs
        JOIN participants fromParticipant ON fromParticipant.id = pairs.from_id
        JOIN participants toParticipant ON toParticipant.id = pairs.to_id
        LEFT JOIN users fromUser ON fromUser.id = fromParticipant.user_id
        LEFT JOIN users toUser ON toUser.id = toParticipant.user_id
        JOIN games g ON g.id = pairs.game_id
        WHERE pairs.game_id = ?
      `)
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
    addEvent(id, 'settings', `Импортировано прошлых пар: ${result}`, req.user?.id ?? null)
    res.status(201).json({ imported: result, total: rows.length })
  },
)

gamesRouter.post('/:id/exclusions', validateBody(schemas.exclusion), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const { fromId, toId } = req.body
  const participants = db.prepare('SELECT id FROM participants WHERE game_id = ?').all(id)
  const ids = new Set(participants.map((person) => person.id))
  if (!ids.has(fromId) || !ids.has(toId) || fromId === toId) fail(400, 'Некорректная пара исключения')

  db.prepare('INSERT OR IGNORE INTO exclusions (game_id, from_id, to_id) VALUES (?, ?, ?)').run(
    id,
    fromId,
    toId,
  )
  res.status(201).json({ fromId, toId })
})

gamesRouter.get('/:id/exclusions', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?').all(id))
})

gamesRouter.delete('/:id/exclusions/:fromId/:toId', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  db.prepare('DELETE FROM exclusions WHERE game_id = ? AND from_id = ? AND to_id = ?').run(
    id,
    Number(req.params.fromId),
    Number(req.params.toId),
  )
  res.json({ ok: true })
})

gamesRouter.post('/:id/draw', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const participants = db.prepare('SELECT id, name FROM participants WHERE game_id = ? ORDER BY id').all(id)
  if (participants.length < 2) fail(400, 'Для жеребьёвки нужно минимум два участника')

  const ids = participants.map((person) => person.id)
  const exclusions = new Set(
    db.prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?').all(id).map(
      (item) => `${item.from_id}:${item.to_id}`,
    ),
  )
  const manual = new Map(
    db.prepare('SELECT from_id, to_id FROM pairs WHERE game_id = ? AND manual = 1').all(id).map(
      (item) => [item.from_id, item.to_id],
    ),
  )

  const solution = drawPairs({ ids, exclusions, manual, past: pastPairsFor(id) })
  if (!solution) fail(409, 'Не удалось распределить пары с текущими ограничениями')

  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ?').run(id)
    const insert = db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, ?)')
    for (const [from, to] of solution) insert.run(id, from, to, manual.has(from) ? 1 : 0)
    addEvent(id, 'draw', 'Проведена жеребьёвка', req.user?.id ?? null)
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.post('/:id/draw/new', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
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
    addEvent(id, 'draw', `Дополнительно распределено участников: ${pending.length}`, req.user?.id ?? null)
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.get('/:id/pairs', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  res.json(
    db
      .prepare(`
        SELECT pairs.*, sender.name AS from_name, receiver.name AS to_name
        FROM pairs
        JOIN participants sender ON sender.id = pairs.from_id
        JOIN participants receiver ON receiver.id = pairs.to_id
        WHERE pairs.game_id = ?
        ORDER BY pairs.from_id
      `)
      .all(id),
  )
})

gamesRouter.post('/:id/pairs/reset', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ?').run(id)
    addEvent(id, 'settings', 'Распределение пар сброшено', req.user?.id ?? null)
  })()
  res.json([])
})

gamesRouter.post('/:id/pairs', validateBody(schemas.pair), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const { fromId, toId } = req.body
  const participantIds = new Set(db.prepare('SELECT id FROM participants WHERE game_id = ?').all(id).map((person) => person.id))
  if (!participantIds.has(fromId) || !participantIds.has(toId) || fromId === toId) {
    fail(400, 'Некорректное назначение пары')
  }
  if (db.prepare('SELECT 1 FROM exclusions WHERE game_id = ? AND from_id = ? AND to_id = ?').get(id, fromId, toId)) {
    fail(409, 'Эта пара исключена')
  }

  const current = db.prepare('SELECT to_id FROM pairs WHERE game_id = ? AND from_id = ?').get(id, fromId)
  const other = db.prepare('SELECT from_id FROM pairs WHERE game_id = ? AND to_id = ? AND from_id <> ?').get(id, toId, fromId)

  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ? AND from_id = ?').run(id, fromId)
    if (other) db.prepare('DELETE FROM pairs WHERE game_id = ? AND from_id = ?').run(id, other.from_id)

    db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, 1)').run(
      id,
      fromId,
      toId,
    )
    if (other && current) {
      db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, 1)').run(
        id,
        other.from_id,
        current.to_id,
      )
    }
    addEvent(id, 'settings', 'Распределение пар изменено вручную', req.user?.id ?? null)
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.post('/:id/reveal', validateBody(schemas.reveal), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const fromId = req.body.fromId
  const pair = db.prepare('SELECT * FROM pairs WHERE game_id = ? AND from_id = ?').get(id, fromId)
  if (!pair) fail(404, 'Пара не найдена')
  db.prepare(`UPDATE pairs SET revealed_at = datetime('now') WHERE id = ?`).run(pair.id)
  addEvent(id, 'draw', 'Организатор раскрыл пару', req.user?.id ?? null)
  res.json(db.prepare('SELECT * FROM pairs WHERE id = ?').get(pair.id))
})

gamesRouter.get('/:id/events', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY id DESC').all(id))
})

gamesRouter.get('/:id/notifications', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  res.json(
    db
      .prepare(`
        SELECT n.id, n.kind, n.payload, n.sent_at, n.created_at, p.name AS participant_name
        FROM notifications n
        LEFT JOIN participants p ON p.id = n.participant_id
        WHERE n.game_id = ?
        ORDER BY n.id DESC
      `)
      .all(id),
  )
})

gamesRouter.get('/:id/questions', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY position, id').all(id))
})

gamesRouter.post('/:id/questions', validateBody(schemas.questionCreate), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const { title, hint, type, required, position } = req.body
  const count = db.prepare('SELECT COUNT(*) AS count FROM questions WHERE game_id = ?').get(id).count
  if (count >= 10) fail(400, 'Можно добавить не больше 10 вопросов')

  const result = db
    .prepare(`
      INSERT INTO questions (game_id, title, hint, type, required, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(id, title, hint, type, required ? 1 : 0, position)
  addEvent(id, 'settings', `Добавлен вопрос «${title}»`, req.user?.id ?? null)
  res.status(201).json(db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid))
})

gamesRouter.patch('/:id/questions/:questionId', validateBody(schemas.questionUpdate), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const questionId = Number(req.params.questionId)
  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND game_id = ?').get(questionId, id)
  if (!question) fail(404, 'Вопрос не найден')

  const title = req.body.title === undefined ? question.title : req.body.title
  const hint = req.body.hint === undefined ? question.hint : req.body.hint
  const type = req.body.type === undefined ? question.type : req.body.type
  const required = req.body.required === undefined ? question.required : req.body.required ? 1 : 0
  const position = req.body.position === undefined ? question.position : req.body.position

  db.prepare(`
    UPDATE questions SET title = ?, hint = ?, type = ?, required = ?, position = ? WHERE id = ?
  `).run(title, hint, type, required, position, questionId)
  res.json(db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId))
})

gamesRouter.delete('/:id/questions/:questionId', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const questionId = Number(req.params.questionId)
  const result = db.prepare('DELETE FROM questions WHERE id = ? AND game_id = ?').run(questionId, id)
  if (!result.changes) fail(404, 'Вопрос не найден')
  addEvent(id, 'settings', 'Вопрос удалён', req.user?.id ?? null)
  res.json({ ok: true })
})

gamesRouter.get('/:id/answers', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  res.json(
    db
      .prepare(`
        SELECT answers.*, questions.title AS question_title, participants.name AS participant_name
        FROM answers
        JOIN questions ON questions.id = answers.question_id
        JOIN participants ON participants.id = answers.participant_id
        WHERE questions.game_id = ?
        ORDER BY questions.position, questions.id, participants.id
      `)
      .all(id),
  )
})

gamesRouter.get('/:id/participants/:participantId/answers', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  const participantId = Number(req.params.participantId)
  const participant = db
    .prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?')
    .get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  res.json(
    db
      .prepare(`
        SELECT answers.question_id, answers.value
        FROM answers
        JOIN questions ON questions.id = answers.question_id
        WHERE answers.participant_id = ? AND questions.game_id = ?
        ORDER BY questions.position, questions.id
      `)
      .all(participantId, id),
  )
})

gamesRouter.put('/:id/participants/:participantId/answers', validateBody(schemas.answersSave), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  const participantId = Number(req.params.participantId)
  const participant = db
    .prepare('SELECT id FROM participants WHERE id = ? AND game_id = ?')
    .get(participantId, id)
  if (!participant) fail(404, 'Участник не найден')

  const questions = db.prepare('SELECT * FROM questions WHERE game_id = ?').all(id)
  const allowed = new Map(questions.map((question) => [question.id, question]))
  const values = new Map()
  for (const answer of req.body.answers) {
    const question = allowed.get(answer.questionId)
    if (!question) fail(400, 'Вопрос не относится к этой игре')
    if (values.has(answer.questionId)) fail(400, 'Дублирующий ответ')
    if (question.type === 'number' && answer.value && Number.isNaN(Number(answer.value))) {
      fail(400, `Вопрос «${question.title}» требует число`)
    }
    if (question.type === 'boolean' && answer.value && !['да', 'нет', 'true', 'false', '1', '0'].includes(answer.value.toLowerCase())) {
      fail(400, `Вопрос «${question.title}» требует да/нет`)
    }
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
    addNotification(id, participantId, { answers: req.body.answers })
  })()

  res.json(
    db
      .prepare(`
        SELECT answers.question_id, answers.value
        FROM answers
        JOIN questions ON questions.id = answers.question_id
        WHERE answers.participant_id = ? AND questions.game_id = ?
        ORDER BY questions.position, questions.id
      `)
      .all(participantId, id),
  )
})

gamesRouter.get('/:id/messages', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  res.json(
    db.prepare(`
      SELECT messages.*, sender.name AS from_name, receiver.name AS to_name
      FROM messages
      LEFT JOIN participants sender ON sender.id = messages.from_id
      LEFT JOIN participants receiver ON receiver.id = messages.to_id
      WHERE messages.game_id = ?
      ORDER BY messages.id DESC
    `).all(id),
  )
})

gamesRouter.post('/:id/messages', validateBody(schemas.message), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const { body } = req.body
  const fromId = req.body.fromId ?? null
  const toId = req.body.toId ?? null
  const participantIds = new Set(db.prepare('SELECT id FROM participants WHERE game_id = ?').all(id).map((person) => person.id))
  if (fromId !== null && !participantIds.has(fromId)) fail(400, 'Отправитель не участвует в игре')
  if (toId !== null && !participantIds.has(toId)) fail(400, 'Получатель не участвует в игре')

  const result = db
    .prepare('INSERT INTO messages (game_id, from_id, to_id, body) VALUES (?, ?, ?, ?)')
    .run(id, fromId, toId, body)
  addEvent(id, 'message', 'Отправлено сообщение', req.user?.id ?? null)
  res.status(201).json(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid))
})

gamesRouter.get('/:id/reminders', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  res.json(
    db.prepare(`
      SELECT messages.*, participants.name AS participant_name
      FROM messages
      LEFT JOIN participants ON participants.id = messages.to_id
      WHERE messages.game_id = ? AND messages.from_id IS NULL
      ORDER BY messages.id DESC
    `).all(id),
  )
})

gamesRouter.post(
  '/:id/reminders',
  reminderRateLimit,
  validateBody(schemas.reminder),
  (req, res) => {
    const id = resolveGameId(req.params.id)
    getGame(id)
    requireOrganizer(id, req.user)
    const { body, recipientIds } = req.body
    const uniqueIds = [...new Set(recipientIds.map(Number))]
    const participants = db
      .prepare(`SELECT id, name, email FROM participants WHERE game_id = ? AND id IN (${uniqueIds.map(() => '?').join(',')})`)
      .all(id, ...uniqueIds)
    if (participants.length !== uniqueIds.length) fail(400, 'Некоторые участники не найдены')

    const dedupeKey = createHash('sha256')
      .update(`${id}|${uniqueIds.sort((a, b) => a - b).join(',')}|${body}`)
      .digest('hex')
    const duplicate = db
      .prepare(`
        SELECT id FROM messages
        WHERE game_id = ? AND dedupe_key = ? AND created_at >= datetime('now', '-5 minutes')
      `)
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
        return db.prepare(`
          SELECT messages.*, participants.name AS participant_name
          FROM messages JOIN participants ON participants.id = messages.to_id
          WHERE messages.id = ?
        `).get(result.lastInsertRowid)
      }),
    )()
    addEvent(id, 'message', `Отправлено напоминаний: ${created.length}`, req.user?.id ?? null)
    res.status(201).json(created)
  },
)

gamesRouter.get('/:id/organizers', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  res.json(
    db.prepare(`
      SELECT organizers.*, users.token AS user_token, users.email AS user_email
      FROM organizers
      LEFT JOIN users ON users.id = organizers.user_id
      WHERE organizers.game_id = ?
      ORDER BY organizers.id
    `).all(id).map((organizer) => ({
      ...organizer,
      url: organizer.invited_token ? publicLink(req, `/organizer/${organizer.invited_token}`) : null,
    })),
  )
})

gamesRouter.post('/:id/organizers', validateBody(schemas.organizer), (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
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
  addEvent(id, 'settings', 'Добавлен организатор', req.user?.id ?? null)
  res.status(201).json({ userId: user.id })
})

gamesRouter.post('/:id/organizers/invite', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const count = db.prepare('SELECT COUNT(*) AS total FROM organizers WHERE game_id = ?').get(id).total
  if (count >= 3) fail(409, 'Максимум три организатора')

  const token = inviteToken()
  const result = db
    .prepare(`
      INSERT INTO organizers (game_id, user_id, role, invited_token)
      VALUES (?, NULL, 'organizer', ?)
    `)
    .run(id, token)
  addEvent(id, 'settings', 'Создано приглашение организатора', req.user?.id ?? null)
  res.status(201).json({
    id: result.lastInsertRowid,
    token,
    url: publicLink(req, `/organizer/${token}`),
  })
})

gamesRouter.delete('/:id/organizers/:organizerId', (req, res) => {
  const id = resolveGameId(req.params.id)
  getGame(id)
  requireOrganizer(id, req.user)
  const organizerId = Number(req.params.organizerId)
  const organizer = db
    .prepare('SELECT id, role, user_id FROM organizers WHERE id = ? AND game_id = ?')
    .get(organizerId, id)
  if (!organizer) fail(404, 'Организатор не найден')

  const count = db.prepare('SELECT COUNT(*) AS total FROM organizers WHERE game_id = ?').get(id).total
  if (count <= 1) fail(409, 'Нельзя удалить последнего организатора')
  if (organizer.role === 'owner') {
    const accepted = db
      .prepare(`
        SELECT COUNT(*) AS total FROM organizers
        WHERE game_id = ? AND user_id IS NOT NULL AND id <> ?
      `)
      .get(id, organizerId).total
    if (!accepted) fail(409, 'Сначала передайте управление принявшему приглашение организатору')
  }

  db.prepare('DELETE FROM organizers WHERE id = ?').run(organizerId)
  addEvent(id, 'settings', 'Организатор удалён', req.user?.id ?? null)
  res.json({ ok: true })
})

gamesRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
