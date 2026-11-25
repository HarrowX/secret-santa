import { Router } from 'express'
import { fail, HttpError } from '../http-error.js'
import { requireOrganizer } from '../permissions.js'
import { gamesRepository } from '../repositories/games.js'
import { tenantsRepository } from '../repositories/tenants.js'
import { schemas, validateBody } from '../validation.js'

export const tenantsRouter = Router()

const reserved = new Set(['www', 'api', 'admin', 'app', 'mail', 'santa'])

function cleanSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{3,32}$/.test(value)) fail(400, 'Неверный поддомен')
  if (reserved.has(value)) fail(409, 'Это имя зарезервировано')
  return value
}

tenantsRouter.get('/', (_req, res) => {
  res.json(tenantsRepository.list())
})

tenantsRouter.get('/current', (req, res) => {
  res.json({ tenant: req.tenant ?? null })
})

tenantsRouter.post('/', validateBody(schemas.tenant), (req, res) => {
  const slug = cleanSlug(req.body.slug)
  const gameId = req.body.gameId
  const game = gamesRepository.findById(gameId)
  if (!game) fail(404, 'Игра не найдена')
  requireOrganizer(game.id, req.user)
  const domain = req.body.domain ?? null

  try {
    tenantsRepository.create({ slug, gameId, domain })
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) fail(409, 'Поддомен уже занят')
    throw error
  }

  res.status(201).json(tenantsRepository.findBySlug(slug))
})

tenantsRouter.get('/:slug', (req, res) => {
  const tenant = tenantsRepository.findBySlug(req.params.slug)
  if (!tenant) fail(404, 'Поддомен не найден')
  res.json({ tenant, game: gamesRepository.findById(tenant.game_id) })
})

tenantsRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
