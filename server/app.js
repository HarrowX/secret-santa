import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authMiddleware } from './middlewares/auth.js'
import { rateLimit } from './middlewares/rateLimit.js'
import { requestLogger } from './middlewares/logger.js'
import { tenantMiddleware } from './middlewares/tenant.js'
import { HttpError } from './http-error.js'
import { authRouter } from './routes/auth.js'
import { gamesRouter } from './routes/games.js'
import { invitesRouter } from './routes/invites.js'
import { meRouter } from './routes/me.js'
import { organizerInvitesRouter } from './routes/organizer-invites.js'
import { randomizerRouter } from './routes/randomizer.js'
import { supportRouter } from './routes/support.js'
import { tenantsRouter } from './routes/tenants.js'
import { themesRouter } from './routes/themes.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function createApp() {
  const app = express()

  app.use(requestLogger)
  app.use(express.json())
  app.use(authMiddleware)
  app.use(tenantMiddleware)

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.get('/api/message', (_req, res) => {
    res.json({ message: 'Привет из Secret Santa API' })
  })

  app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 20 }), authRouter)
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
    console.log(
      JSON.stringify({ level: 'error', msg: 'request_failed', path: req.originalUrl.split('?')[0], name: error.name }),
    )
    res.status(500).json({ error: { message: 'Внутренняя ошибка сервера' } })
  })

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(root, 'dist')))
    app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
  }

  return app
}
