function clientKey(req) {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

export function rateLimit({ windowMs = 60_000, max = 10, name = 'rate', key } = {}) {
  return (req, res, next) => {
    const store = (req.app.locals.rateLimits ??= new Map())
    const identity = key ? key(req) : clientKey(req)
    const cacheKey = `${name}:${identity}`
    const now = Date.now()
    const entry = store.get(cacheKey) ?? { start: now, count: 0 }

    if (now - entry.start > windowMs) {
      entry.start = now
      entry.count = 0
    }

    entry.count += 1
    store.set(cacheKey, entry)

    if (entry.count > max) {
      res.status(429).json({ error: { message: 'Слишком много запросов' } })
      return
    }

    next()
  }
}
