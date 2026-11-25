import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authMiddleware } from './middlewares/auth.js'
import { HttpError } from './http-error.js'
import { authRouter } from './routes/auth.js'
import { gamesRouter } from './routes/games.js'
import { tenantsRouter } from './routes/tenants.js'

const app = express()
const port = process.env.PORT || 3000
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.use(express.json())
app.use(authMiddleware)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/message', (_req, res) => {
  res.json({ message: 'Привет из Secret Santa API' })
})

app.use('/api/auth', authRouter)
app.use('/api/games', gamesRouter)
app.use('/api/tenants', tenantsRouter)

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  console.error(error)
  res.status(500).json({ error: { message: 'Внутренняя ошибка сервера' } })
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')))
  app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}

app.listen(port, () => {
  console.log(`Express API: http://localhost:${port}`)
})
