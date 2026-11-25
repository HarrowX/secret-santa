import { Router } from 'express'
import { fail, HttpError } from '../http-error.js'
import { rateLimit } from '../middlewares/rateLimit.js'
import { requireOrganizer } from '../permissions.js'
import { gamesRepository } from '../repositories/games.js'
import { tenantsRepository } from '../repositories/tenants.js'
import { schemas, validateBody } from '../validation.js'

export const tenantsRouter = Router()

const reserved = new Set(['www', 'api', 'admin', 'app', 'mail', 'santa'])
const tenantRateLimit = rateLimit({ name: 'tenant-create', windowMs: 60_000, max: 10 })

function cleanSlug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{3,32}$/.test(value)) fail(400, 'Неверный поддомен')
  if (reserved.has(value)) fail(409, 'Это имя зарезервировано')
  return value
}

tenantsRouter.get('/', (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')
  res.json(tenantsRepository.listForUser(req.user.id))
})

tenantsRouter.get('/current', (req, res) => {
  res.json({ tenant: req.tenant ?? null })
})

tenantsRouter.post('/', tenantRateLimit, validateBody(schemas.tenant), (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')
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
  if (req.user) {
    const allowed = tenantsRepository.listForUser(req.user.id).some((item) => item.id === tenant.id)
    if (!allowed) fail(403, 'Нет доступа к поддомену')
  } else if (!req.tenant || req.tenant.id !== tenant.id) {
    fail(403, 'Нет доступа к поддомену')
  }
  const { token: _token, ...game } = gamesRepository.findById(tenant.game_id)
  res.json({ tenant, game })
})

tenantsRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
