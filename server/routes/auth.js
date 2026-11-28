import { Router } from 'express'
import { db } from '../db.js'
import { fail, HttpError } from '../http-error.js'
import { hashPassword, verifyPassword } from '../passwords.js'
import { schemas, validateBody } from '../validation.js'
import {
  createRecoveryCodes,
  createSession,
  createToken,
  hashToken,
  publicUser,
  readCookie,
  SESSION_COOKIE,
} from '../auth.js'

export const authRouter = Router()

function userById(id) {
  return db.prepare('SELECT id, token, email, password_hash, created_at FROM users WHERE id = ?').get(id)
}

function userByEmail(email) {
  return db.prepare('SELECT id, token, email, password_hash, created_at FROM users WHERE email = ?').get(email)
}

authRouter.get('/session', (req, res) => {
  res.json({ user: req.user ?? null, csrfToken: req.csrfToken })
})

authRouter.post('/session', (req, res) => {
  let user
  let recoveryCodes

  db.transaction(() => {
    const token = createToken(16)
    const result = db.prepare('INSERT INTO users (token) VALUES (?)').run(token)
    const userId = Number(result.lastInsertRowid)
    user = userById(userId)
    recoveryCodes = createRecoveryCodes(userId)
    createSession(userId, res)
  })()

  res.status(201).json({ user: publicUser(user), recoveryCodes, csrfToken: req.csrfToken })
})

authRouter.post('/register', validateBody(schemas.credentials), (req, res) => {
  const { email, password } = req.body
  const passwordHash = hashPassword(password)

  if (req.user) {
    if (req.user.email || req.user.has_password) fail(409, 'У пользователя уже есть регистрация')
    try {
      db.transaction(() => {
        db.prepare('UPDATE users SET email = ?, password_hash = ? WHERE id = ?').run(email, passwordHash, req.user.id)
        db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(req.user.id)
      })()
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) fail(409, 'Этот email уже занят')
      throw error
    }
    res.json({ user: publicUser(userById(req.user.id)) })
    return
  }

  let user
  try {
    db.transaction(() => {
      const token = createToken(16)
      const result = db
        .prepare('INSERT INTO users (token, email, password_hash) VALUES (?, ?, ?)')
        .run(token, email, passwordHash)
      const userId = Number(result.lastInsertRowid)
      user = userById(userId)
      createSession(userId, res)
    })()
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Этот email уже занят')
    throw error
  }

  res.status(201).json({ user: publicUser(user) })
})

authRouter.post('/login', validateBody(schemas.credentials), (req, res) => {
  const { email, password } = req.body
  const user = userByEmail(email)
  if (!user || !verifyPassword(password, user.password_hash)) {
    fail(401, 'Неверный email или пароль')
  }
  createSession(user.id, res)
  res.json({ user: publicUser(user) })
})

authRouter.post('/recovery', validateBody(schemas.recovery), (req, res) => {
  const code = req.body.code
  const row = db
    .prepare(
      `
      SELECT r.id, r.user_id, u.token, u.email, u.created_at
      FROM recovery_codes r
      JOIN users u ON u.id = r.user_id
      WHERE r.code_hash = ? AND r.used_at IS NULL
    `,
    )
    .get(hashToken(code))
  if (!row) fail(400, 'Код восстановления не найден или уже использован')

  let recoveryCodes
  db.transaction(() => {
    db.prepare(`UPDATE recovery_codes SET used_at = datetime('now') WHERE id = ?`).run(row.id)
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(row.user_id)
    recoveryCodes = createRecoveryCodes(row.user_id)
    createSession(row.user_id, res)
  })()

  res.json({
    user: publicUser({ id: row.user_id, token: row.token, email: row.email, created_at: row.created_at }),
    recoveryCodes,
  })
})

authRouter.patch('/email', validateBody(schemas.email), (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')
  const email = req.body.email

  try {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, req.user.id)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Этот email уже занят')
    throw error
  }

  res.json({ user: publicUser(userById(req.user.id)) })
})

authRouter.post('/logout', (req, res) => {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
})

authRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
