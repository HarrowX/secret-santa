import { Router } from 'express'
import { drawPairs } from '../services/draw.js'
import { fail, HttpError } from '../http-error.js'
import { schemas, validateBody } from '../validation.js'

export const randomizerRouter = Router()

randomizerRouter.post('/', validateBody(schemas.randomizer), (req, res) => {
  const seen = new Set()
  const names = req.body.names
    .split(/[,\n]/)
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase('ru')
      if (!name || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 100)
  if (names.length < 2) fail(400, 'Нужно минимум два имени')

  const solution = drawPairs({ ids: names.map((_name, index) => index) })
  if (!solution) fail(409, 'Не удалось распределить пары')

  res.json(
    names.map((name, index) => ({
      from: name,
      to: names[solution.get(index)],
    })),
  )
})

randomizerRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
