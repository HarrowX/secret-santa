import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db } from '../db.js'

export const gamesRouter = Router()

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function fail(status, message) {
  throw new HttpError(status, message)
}

function getGame(id) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(id)
  if (!game) fail(404, 'Игра не найдена')
  return game
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(400, `${label} обязателен`)
  return value.trim()
}

function addEvent(gameId, kind, text, actor = null) {
  db.prepare('INSERT INTO events (game_id, kind, text, actor) VALUES (?, ?, ?, ?)').run(
    gameId,
    kind,
    text,
    actor,
  )
}

function shuffled(values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

gamesRouter.get('/', (_req, res) => {
  const games = db
    .prepare(`
      SELECT g.*, (SELECT COUNT(*) FROM participants p WHERE p.game_id = g.id) AS participants_count
      FROM games g
      ORDER BY g.id DESC
    `)
    .all()
  res.json(games)
})

gamesRouter.post('/', (req, res) => {
  const { title, budget = '', exchangeDate = '', rules = '', themeId = 'winter' } = req.body ?? {}
  const cleanTitle = requireText(title, 'Название игры')
  const theme = db.prepare('SELECT id FROM themes WHERE id = ?').get(themeId)
  if (!theme) fail(400, 'Неизвестная тема оформления')

  const token = randomUUID().slice(0, 8)
  const result = db
    .prepare(`
      INSERT INTO games (token, title, budget, exchange_date, rules, theme_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(token, cleanTitle, String(budget), String(exchangeDate), String(rules), themeId)

  const id = Number(result.lastInsertRowid)
  db.prepare('INSERT INTO organizers (game_id, role) VALUES (?, ?)').run(id, 'owner')
  addEvent(id, 'settings', 'Игра создана')
  res.status(201).json(getGame(id))
})

gamesRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id)
  const game = getGame(id)

  res.json({
    game,
    participants: db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id),
    questions: db.prepare('SELECT * FROM questions WHERE game_id = ? ORDER BY position, id').all(id),
    pairs: db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id),
    events: db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY id DESC').all(id),
  })
})

gamesRouter.post('/:id/participants', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
  const name = requireText(req.body?.name, 'Имя участника')

  let result
  try {
    result = db.prepare('INSERT INTO participants (game_id, name) VALUES (?, ?)').run(id, name)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Участник с таким именем уже есть')
    throw error
  }

  const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(result.lastInsertRowid)
  addEvent(id, 'join', `${name} присоединился к игре`, name)
  res.status(201).json(participant)
})

gamesRouter.get('/:id/participants', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT * FROM participants WHERE game_id = ? ORDER BY id').all(id))
})

gamesRouter.post('/:id/exclusions', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
  const fromId = Number(req.body?.fromId)
  const toId = Number(req.body?.toId)
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
  const id = Number(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT from_id, to_id FROM exclusions WHERE game_id = ?').all(id))
})

gamesRouter.post('/:id/draw', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
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

  let solution = null
  for (let attempt = 0; attempt < 200 && !solution; attempt += 1) {
    const order = shuffled(ids)
    const candidate = new Map(ids.map((from, index) => [from, order[(index + 1) % order.length]]))
    const valid = ids.every((from) => {
      const to = candidate.get(from)
      return (
        from !== to &&
        !exclusions.has(`${from}:${to}`) &&
        (!manual.has(from) || manual.get(from) === to)
      )
    })
    if (valid) solution = candidate
  }

  if (!solution) fail(409, 'Не удалось распределить пары с текущими ограничениями')

  db.transaction(() => {
    db.prepare('DELETE FROM pairs WHERE game_id = ?').run(id)
    const insert = db.prepare('INSERT INTO pairs (game_id, from_id, to_id, manual) VALUES (?, ?, ?, ?)')
    for (const [from, to] of solution) insert.run(id, from, to, manual.has(from) ? 1 : 0)
    addEvent(id, 'draw', 'Проведена жеребьёвка')
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.get('/:id/pairs', (req, res) => {
  const id = Number(req.params.id)
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

gamesRouter.post('/:id/pairs', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
  const fromId = Number(req.body?.fromId)
  const toId = Number(req.body?.toId)
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
    addEvent(id, 'settings', 'Распределение пар изменено вручную')
  })()

  res.json(db.prepare('SELECT * FROM pairs WHERE game_id = ? ORDER BY from_id').all(id))
})

gamesRouter.post('/:id/reveal', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
  const fromId = Number(req.body?.fromId)
  const pair = db.prepare('SELECT * FROM pairs WHERE game_id = ? AND from_id = ?').get(id, fromId)
  if (!pair) fail(404, 'Пара не найдена')
  db.prepare('UPDATE pairs SET revealed_at = datetime("now") WHERE id = ?').run(pair.id)
  addEvent(id, 'draw', 'Организатор раскрыл пару')
  res.json(db.prepare('SELECT * FROM pairs WHERE id = ?').get(pair.id))
})

gamesRouter.get('/:id/events', (req, res) => {
  const id = Number(req.params.id)
  getGame(id)
  res.json(db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY id DESC').all(id))
})

gamesRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
