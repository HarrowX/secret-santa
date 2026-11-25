import { Router } from 'express'
import { db } from '../db.js'
import { fail, HttpError } from '../http-error.js'

export const meRouter = Router()

meRouter.get('/games', (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')

  res.json(
    db
      .prepare(
        `
        SELECT DISTINCT g.id, g.token, g.title, g.budget, g.exchange_date, g.rules, g.theme_id,
          CASE WHEN o.id IS NOT NULL THEN o.role ELSE 'participant' END AS role
        FROM games g
        LEFT JOIN organizers o ON o.game_id = g.id AND o.user_id = ?
        LEFT JOIN participants p ON p.game_id = g.id AND p.user_id = ?
        WHERE o.id IS NOT NULL OR p.id IS NOT NULL
        ORDER BY g.id DESC
      `,
      )
      .all(req.user.id, req.user.id),
  )
})

meRouter.get('/past-games', (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')

  res.json(
    db
      .prepare(
        `
        SELECT DISTINCT g.id, g.token, g.title, g.exchange_date
        FROM games g
        JOIN participants p ON p.game_id = g.id
        WHERE p.user_id = ?
        ORDER BY g.id DESC
      `,
      )
      .all(req.user.id),
  )
})

meRouter.get('/exchanges', (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')

  res.json(
    db
      .prepare(
        `
        SELECT g.id AS game_id, g.token AS game_token, g.title, g.budget, g.exchange_date, g.rules,
          p.id AS participant_id, p.name AS player_name,
          recipient.id AS receiver_id, recipient.name AS receiver_name,
          recipient.wishlist, recipient.address, recipient.notes, recipient.preferred,
          pairs.revealed_at
        FROM participants p
        JOIN games g ON g.id = p.game_id
        JOIN pairs ON pairs.from_id = p.id
        JOIN participants recipient ON recipient.id = pairs.to_id
        WHERE p.user_id = ?
        ORDER BY g.id DESC
      `,
      )
      .all(req.user.id),
  )
})

meRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
