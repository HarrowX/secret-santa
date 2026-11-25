import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db } from '../db.js'
import { fail, HttpError } from '../http-error.js'
import { rateLimit } from '../middlewares/rateLimit.js'
import { schemas, validateBody } from '../validation.js'

export const invitesRouter = Router()
const inviteAcceptRateLimit = rateLimit({ name: 'invite-accept', windowMs: 60_000, max: 20 })

invitesRouter.get('/:token', (req, res) => {
  const participant = db
    .prepare(
      `
      SELECT         p.id, p.name, p.email, p.wishlist, p.address, p.notes, p.preferred,
        p.filled, p.invite_token, g.id AS game_id, g.token AS game_token, g.title, g.theme_id
      FROM participants p
      JOIN games g ON g.id = p.game_id
      WHERE p.invite_token = ?
    `,
    )
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
      token: participant.game_token,
      title: participant.title,
      themeId: participant.theme_id,
    },
  })
})

invitesRouter.post('/:token/accept', inviteAcceptRateLimit, validateBody(schemas.inviteAccept), (req, res) => {
  const participant = db.prepare('SELECT * FROM participants WHERE invite_token = ?').get(req.params.token)
  if (!participant) fail(404, 'Приглашение не найдено')
  if (participant.user_id && participant.user_id !== req.user?.id) {
    fail(409, 'Приглашение привязано к другому аккаунту')
  }

  const value = (key) => (req.body[key] === undefined ? participant[key] : req.body[key])
  const userId = req.user?.id ?? participant.user_id
  const identityToken = participant.identity_token || req.body.pastIdentityToken || randomUUID()
  db.prepare(
    `
      UPDATE participants
      SET user_id = ?, identity_token = ?, email = ?, wishlist = ?, address = ?, notes = ?, preferred = ?, filled = 1
      WHERE id = ?
    `,
  ).run(
    userId,
    identityToken,
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
  const updated = db.prepare('SELECT * FROM participants WHERE id = ?').get(participant.id)
  db.prepare(
    `
    INSERT INTO notifications (game_id, participant_id, kind, payload) VALUES (?, ?, ?, ?)
  `,
  ).run(participant.game_id, participant.id, 'card_updated', JSON.stringify({ text: 'Карточка участника обновлена' }))
  res.json({ ok: true, participant: updated })
})

invitesRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
