export function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  const hits = new Map()

  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const entry = hits.get(key) ?? { start: now, count: 0 }

    if (now - entry.start > windowMs) {
      entry.start = now
      entry.count = 0
    }

    entry.count += 1
    hits.set(key, entry)

    if (entry.count > max) {
      res.status(429).json({ error: { message: 'Слишком много запросов' } })
      return
    }

    next()
  }
}
