import { db } from '../db.js'

function clientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

export function rateLimit({ windowMs = 60_000, max = 10, name = 'rate', key } = {}) {
  const cleanup = db.prepare("DELETE FROM rate_limits WHERE updated_at < datetime('now', '-1 day')")
  const increment = db.prepare(`
    INSERT INTO rate_limits (key, window_start, count, updated_at)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(key, window_start) DO UPDATE SET
      count = count + 1,
      updated_at = datetime('now')
    RETURNING count
  `)

  return (req, res, next) => {
    const identity = key ? key(req) : clientKey(req)
    const cacheKey = `${name}:${identity}`
    const now = Date.now()
    const windowStart = now - (now % windowMs)

    try {
      cleanup.run()
      const row = increment.get(cacheKey, windowStart)
      if (row.count > max) {
        res.status(429).json({ error: { message: 'Слишком много запросов' } })
        return
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
