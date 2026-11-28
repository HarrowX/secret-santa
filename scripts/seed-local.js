import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { applyMigrations, ensureLegacyColumns } from '../server/migrations.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const productionDbPath = path.join(root, 'data', 'secret-santa.sqlite')
const clearedTables = [
  'chat_messages',
  'messages',
  'notifications',
  'events',
  'answers',
  'pairs',
  'exclusions',
  'past_pairs',
  'tenants',
  'metrics',
  'questions',
  'organizers',
  'participants',
  'games',
  'support_requests',
  'sessions',
  'recovery_codes',
  'users',
  'rate_limits',
  'monitoring_errors',
  'monitoring_checks',
]

function resolveTarget(dbPath) {
  const display = String(dbPath || '').trim() || './data/seed.sqlite'
  return { display, target: path.resolve(root, display) }
}

function assertSafeTarget(target, env) {
  if (
    String(env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'production'
  ) {
    throw new Error('Локальный сидер запрещён при NODE_ENV=production')
  }
  if (target === productionDbPath) {
    throw new Error('Локальный сидер не может писать в ./data/secret-santa.sqlite')
  }
}

function openSeedDatabase(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const database = new Database(target)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  ensureLegacyColumns(database)
  applyMigrations(database)
  return database
}

function clearSeedData(database) {
  database.transaction(() => {
    for (const table of clearedTables) database.exec(`DELETE FROM ${table}`)
  })()
}

function inviteToken() {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}

function seedGame(database) {
  const gameToken = randomUUID()
  const inviteTokens = Array.from({ length: 4 }, () => inviteToken())
  const names = ['Аня', 'Борис', 'Вика', 'Дима']

  const gameId = Number(
    database
      .prepare(
        `INSERT INTO games (token, title, budget, exchange_date, rules, format, theme_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        gameToken,
        'Локальный обмен подарками',
        'до 1000 ₽',
        '2026-12-25',
        'Без сладкого, до 25 декабря',
        'classic',
        'winter',
      ).lastInsertRowid,
  )

  const insertParticipant = database.prepare(
    `INSERT INTO participants
       (game_id, invite_token, name, wishlist, address, notes, preferred, filled)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  )
  const participantIds = names.map((name, index) =>
    Number(
      insertParticipant.run(
        gameId,
        inviteTokens[index],
        name,
        ['Книга', 'Кофе', 'Цветы', 'Шоколад'][index],
        ['Москва, ул. Лесная, 5', 'Москва, ул. Садовая, 7', 'Казань, ул. Центральная, 3', 'Сочи, ул. Морская, 9'][
          index
        ],
        ['Не звонить после 21:00', 'Только без сладкого', 'Подарок без ценника', 'Вручить вечером'][index],
        ['Аня, Борис, Вика', 'Аня, Вика, Дима', 'Борис, Дима', 'Аня, Борис, Вика'][index],
      ).lastInsertRowid,
    ),
  )

  const questionRows = [
    {
      title: 'Что хочется получить?',
      hint: 'Например, книгу',
      type: 'text',
      options: null,
      answers: ['Книгу', 'Кофе', 'Цветы', 'Шоколад'],
    },
    {
      title: 'Любите сладкое?',
      hint: 'Да или нет',
      type: 'boolean',
      options: null,
      answers: ['Да', 'Нет', 'Да', 'Да'],
    },
    {
      title: 'Любимый цвет',
      hint: 'Например, синий',
      type: 'single',
      options: JSON.stringify(['Синий', 'Зелёный', 'Красный']),
      answers: ['Синий', 'Зелёный', 'Красный', 'Синий'],
    },
  ]
  const insertQuestion = database.prepare(
    `INSERT INTO questions (game_id, title, hint, type, options, required, position)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  )
  const insertAnswer = database.prepare('INSERT INTO answers (question_id, participant_id, value) VALUES (?, ?, ?)')

  questionRows.forEach((question, questionIndex) => {
    const questionId = Number(
      insertQuestion.run(gameId, question.title, question.hint, question.type, question.options, questionIndex)
        .lastInsertRowid,
    )
    participantIds.forEach((participantId, participantIndex) => {
      insertAnswer.run(questionId, participantId, question.answers[participantIndex])
    })
  })

  const insertPair = database.prepare(
    `INSERT INTO pairs (game_id, from_id, to_id, manual, revealed_at)
     VALUES (?, ?, ?, 0, datetime('now'))`,
  )
  const pairIndexes = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ]
  for (const [from, to] of pairIndexes) insertPair.run(gameId, participantIds[from], participantIds[to])

  const insertChat = database.prepare('INSERT INTO chat_messages (game_id, from_id, to_id, body) VALUES (?, ?, ?, ?)')
  const chatRows = [
    [0, 1, 'Привет! Начнём с книги?'],
    [1, 2, 'Мне интересна история про город'],
    [2, 3, 'Договорились о встрече в субботу'],
    [3, 0, 'Спасибо, будет сюрприз'],
  ]
  for (const [from, to, body] of chatRows) {
    insertChat.run(gameId, participantIds[from], participantIds[to], body)
  }

  const insertEvent = database.prepare('INSERT INTO events (game_id, kind, text, actor) VALUES (?, ?, ?, NULL)')
  const eventRows = [
    ['game', 'Локальная игра готова к просмотру'],
    ['question', 'Анкеты участников заполнены'],
    ['draw', 'Проведена жеребьёвка'],
    ['reveal', 'Пары раскрыты'],
    ['chat', 'Участники обменялись сообщениями'],
  ]
  for (const [kind, text] of eventRows) insertEvent.run(gameId, kind, text)

  return { gameToken, inviteToken: inviteTokens[0] }
}

export function seedLocal({ dbPath, env = process.env } = {}) {
  const { display, target } = resolveTarget(dbPath)
  assertSafeTarget(target, env)
  const database = openSeedDatabase(target)
  try {
    clearSeedData(database)
    const seeded = seedGame(database)
    return { ...seeded, dbPath: display, target }
  } finally {
    database.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = seedLocal()
    console.log(`DB_PATH=${result.dbPath} npm run dev`)
    console.log(`http://localhost:5173/game/${result.gameToken}`)
    console.log(`http://localhost:5173/participant/${result.inviteToken}`)
  } catch (error) {
    console.error(error?.message || 'Локальный сидер завершился ошибкой')
    process.exitCode = 1
  }
}
