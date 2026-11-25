import { Router } from 'express'
import { db } from '../db.js'
import { fail, HttpError } from '../http-error.js'

export const tenantsRouter = Router()

const reserved = new Set(['www', 'api', 'admin', 'app', 'mail', 'santa'])

function cleanSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{3,32}$/.test(value)) fail(400, 'Неверный поддомен')
  if (reserved.has(value)) fail(409, 'Это имя зарезервировано')
  return value
}

tenantsRouter.get('/', (_req, res) => {
  res.json(
    db.prepare(`
      SELECT tenants.*, games.title AS game_title
      FROM tenants
      JOIN games ON games.id = tenants.game_id
      ORDER BY tenants.id DESC
    `).all(),
  )
})

tenantsRouter.post('/', (req, res) => {
  const slug = cleanSlug(req.body?.slug)
  const gameId = Number(req.body?.gameId)
  const game = db.prepare('SELECT id FROM games WHERE id = ?').get(gameId)
  if (!game) fail(404, 'Игра не найдена')
  const domain = req.body?.domain ? String(req.body.domain) : null

  try {
    db.prepare('INSERT INTO tenants (slug, game_id, domain) VALUES (?, ?, ?)').run(slug, gameId, domain)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Поддомен уже занят')
    throw error
  }

  res.status(201).json(db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug))
})

tenantsRouter.get('/:slug', (req, res) => {
  const tenant = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(req.params.slug)
  if (!tenant) fail(404, 'Поддомен не найден')
  res.json({ tenant, game: db.prepare('SELECT * FROM games WHERE id = ?').get(tenant.game_id) })
})

tenantsRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
