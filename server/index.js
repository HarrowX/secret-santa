import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = process.env.PORT || 3000
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/message', (_req, res) => {
  res.json({ message: 'Привет из Secret Santa API' })
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(root, 'dist')))
  app.use((_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}

app.listen(port, () => {
  console.log(`Express API: http://localhost:${port}`)
})
