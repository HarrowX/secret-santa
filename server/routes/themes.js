import { Router } from 'express'
import { db } from '../db.js'

export const themesRouter = Router()

themesRouter.get('/', (_req, res) => {
  res.json(
    db
      .prepare('SELECT id, name, tag, accent, night, day, glow FROM themes ORDER BY rowid')
      .all(),
  )
})
