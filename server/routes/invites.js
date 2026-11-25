import { Router } from 'express'
import { db } from '../db.js'
import { fail, HttpError } from '../http-error.js'
import { schemas, validateBody } from '../validation.js'

export const invitesRouter = Router()

invitesRouter.get('/:token', (req, res) => {
  const participant = db
    .prepare(`
      SELECT p.id, p.name, p.email, p.wishlist, p.address, p.notes, p.preferred,
        p.filled, p.invite_token, g.id AS game_id, g.title, g.theme_id
      FROM participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.invite_token = ?
    `)
    .get(req.params.token)
  if (!participant) fail(404, 'Приглашение не найдено')

  res.json({
    participant: {
      id: participant.id,
      name: participant.name,
      email: participant.email ?? null,
      wishlist: participant.wishlist ?? '',
      address: participant.address ?? '',
      notes: participant.notes ?? '',
      preferred: participant.preferred ?? '',
      filled: participant.filled,
    },
    game: {
      id: participant.game_id,
      title: participant.title,
      themeId: participant.theme_id,
    },
  })
})

invitesRouter.post('/:token/accept', validateBody(schemas.inviteAccept), (req, res) => {
  const participant = db
    .prepare('SELECT * FROM participants WHERE invite_token = ?')
    .get(req.params.token)
  if (!participant) fail(404, 'Приглашение не найдено')

  const value = (key) => (req.body[key] === undefined ? participant[key] : req.body[key])
  const userId = req.user?.id ?? participant.user_id
  db
    .prepare(`
      UPDATE participants
      SET user_id = ?, email = ?, wishlist = ?, address = ?, notes = ?, preferred = ?, filled = 1
      WHERE id = ?
    `)
    .run(
      userId,
      value('email'),
      value('wishlist'),
      value('address'),
      value('notes'),
      value('preferred'),
      participant.id,
    )
  db.prepare('INSERT INTO events (game_id, kind, text, actor) VALUES (?, ?, ?, ?)').run(
    participant.game_id,
    'join',
    `${participant.name} подтвердил участие`,
    participant.name,
  )
  res.json({
    ok: true,
    participant: db.prepare('SELECT * FROM participants WHERE id = ?').get(participant.id),
  })
})

invitesRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
