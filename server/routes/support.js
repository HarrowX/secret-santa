import { Router } from 'express'
import { db } from '../db.js'
import { HttpError } from '../http-error.js'
import { rateLimit } from '../middlewares/rateLimit.js'
import { schemas, validateBody } from '../validation.js'

export const supportRouter = Router()

supportRouter.post(
  '/',
  rateLimit({ name: 'support', windowMs: 60_000, max: 5 }),
  validateBody(schemas.support),
  (req, res) => {
    const result = db
      .prepare(
        `
        INSERT INTO support_requests (user_id, email, subject, body)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(req.user?.id ?? null, req.body.email || null, req.body.subject, req.body.body)
    res.status(201).json({ id: result.lastInsertRowid })
  },
)

supportRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
