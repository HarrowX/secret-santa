import { createHash, randomBytes } from 'node:crypto'
import { db } from './db.js'

export const SESSION_COOKIE = 'santa_session'
export const SESSION_TTL = 30 * 24 * 60 * 60 * 1000

export function createToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(value) {
  return createHash('sha256').update(String(value).toUpperCase()).digest('hex')
}

export function readCookie(header, name) {
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    token: row.token,
    email: row.email ?? null,
    has_password: Boolean(row.password_hash),
    created_at: row.created_at ?? null,
  }
}

export function createRecoveryCodes(userId) {
  const insert = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)')
  const codes = []
  for (let index = 0; index < 5; index += 1) {
    const code = randomBytes(6).toString('hex').slice(0, 10).toUpperCase()
    insert.run(userId, hashToken(code))
    codes.push(code)
  }
  return codes
}

export function createSession(userId, res) {
  const token = createToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL).toISOString()
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    hashToken(token),
    expiresAt,
  )
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL,
    path: '/',
  })
  return token
}
