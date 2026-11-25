import { timingSafeEqual } from 'node:crypto'
import { createToken, readCookie, CSRF_COOKIE, SESSION_COOKIE, SESSION_TTL } from '../auth.js'

function tokensEqual(left, right) {
  const first = Buffer.from(String(left ?? ''))
  const second = Buffer.from(String(right ?? ''))
  return first.length === second.length && timingSafeEqual(first, second)
}

function hasParticipantToken(req) {
  return Boolean(req.get('x-invite-token') || req.get('x-organizer-invite-token'))
}

export function csrfMiddleware(req, res, next) {
  let token = readCookie(req.headers.cookie, CSRF_COOKIE)

  if (!token) {
    token = createToken(16)
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL,
      path: '/',
    })
  }

  req.csrfToken = token

  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  const sessionToken = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (unsafe && (sessionToken || hasParticipantToken(req)) && !tokensEqual(req.get('x-csrf-token'), token)) {
    res.status(403).json({ error: { message: 'CSRF-токен недействителен' } })
    return
  }

  next()
}
