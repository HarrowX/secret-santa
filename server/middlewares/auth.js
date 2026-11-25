import { db } from '../db.js'
import { hashToken, readCookie, SESSION_COOKIE } from '../auth.js'

export function authMiddleware(req, _res, next) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  req.user = null

  if (token) {
    const session = db
      .prepare(`
        SELECT u.id, u.token, u.email, u.created_at, s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
      `)
      .get(hashToken(token))

    if (session && new Date(session.expires_at) > new Date()) {
      req.user = {
        id: session.id,
        token: session.token,
        email: session.email ?? null,
      }
    }
  }

  next()
}
