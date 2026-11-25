import express from 'express'
import path from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { authMiddleware } from './middlewares/auth.js'
import { csrfMiddleware } from './middlewares/csrf.js'
import { rateLimit } from './middlewares/rateLimit.js'
import { requestLogger } from './middlewares/logger.js'
import { tenantMiddleware } from './middlewares/tenant.js'
import { fail, HttpError } from './http-error.js'
import { authRouter } from './routes/auth.js'
import { gamesRouter } from './routes/games.js'
import { invitesRouter } from './routes/invites.js'
import { meRouter } from './routes/me.js'
import { organizerInvitesRouter } from './routes/organizer-invites.js'
import { randomizerRouter } from './routes/randomizer.js'
import { supportRouter } from './routes/support.js'
import { tenantsRouter } from './routes/tenants.js'
import { themesRouter } from './routes/themes.js'
import { db } from './db.js'
import { metricsSummary } from './services/metrics.js'
import { latestChecks, recordError, recentErrors } from './services/monitoring.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function tokensEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) return false
  const left = createHash('sha256').update(provided).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

export function createApp() {
  const app = express()
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)

  app.use(requestLogger)
  app.use(express.json())
  app.use(authMiddleware)
  app.use(csrfMiddleware)
  app.use(tenantMiddleware)

  app.get('/api/health', (req, res) => {
    let databaseOk = false
    try {
      db.prepare('SELECT 1').get()
      databaseOk = true
    } catch (error) {
      databaseOk = false
      try {
        recordError({ type: 'health', path: '/api/health', name: error?.name || 'DatabaseError' })
      } catch (recordErrorFailure) {
        console.error(
          JSON.stringify({ level: 'error', msg: 'health_error_record_failed', name: recordErrorFailure?.name }),
        )
      }
    }

    if (!databaseOk) {
      res.status(503).json({ status: 'error', database: 'error' })
      return
    }
    if (req.query.deep === '1') {
      res.json({
        status: 'ok',
        database: 'ok',
        uptime: Math.round(process.uptime()),
        checkedAt: new Date().toISOString(),
      })
      return
    }
    res.json({ status: 'ok' })
  })

  app.get('/api/message', (_req, res) => {
    res.json({ message: 'Привет из Secret Santa API' })
  })

  app.get('/api/metrics', (_req, res) => {
    res.json(metricsSummary())
  })

  app.get('/api/monitoring', (req, res) => {
    const token = process.env.MONITORING_TOKEN
    if (!tokensEqual(req.get('x-monitoring-token'), token)) fail(401, 'Нет доступа к мониторингу')
    res.json({ errors: recentErrors(), checks: latestChecks() })
  })

  app.use('/api/auth', rateLimit({ name: 'auth', windowMs: 60_000, max: 20 }), authRouter)
  app.use('/api/games', gamesRouter)
  app.use('/api/invites', invitesRouter)
  app.use('/api/me', meRouter)
  app.use('/api/organizer-invites', organizerInvitesRouter)
  app.use('/api/randomizer', randomizerRouter)
  app.use('/api/support', supportRouter)
  app.use('/api/tenants', tenantsRouter)
  app.use('/api/themes', themesRouter)

  app.use((error, req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { message: error.message } })
      return
    }
    const pathname = req.originalUrl.split('?')[0]
    recordError({ type: 'request_failed', path: pathname, name: error.name })
    console.log(JSON.stringify({ level: 'error', msg: 'request_failed', path: pathname, name: error.name }))
    res.status(500).json({ error: { message: 'Внутренняя ошибка сервера' } })
  })

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(root, 'dist')))
    app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
  }

  return app
}
