import { Router } from 'express'
import { db } from '../db.js'
import { fail, HttpError } from '../http-error.js'

export const organizerInvitesRouter = Router()

organizerInvitesRouter.post('/:token/accept', (req, res) => {
  if (!req.user) fail(401, 'Нужен активный вход')

  const invite = db
    .prepare(`
      SELECT o.id, o.game_id, o.user_id, g.title, g.token AS game_token
      FROM organizers o
      JOIN games g ON g.id = o.game_id
      WHERE o.invited_token = ?
    `)
    .get(req.params.token)
  if (!invite) fail(404, 'Приглашение не найдено')
  if (invite.user_id) fail(409, 'Приглашение уже использовано')

  const existing = db
    .prepare('SELECT 1 FROM organizers WHERE game_id = ? AND user_id = ?')
    .get(invite.game_id, req.user.id)
  if (existing) fail(409, 'Вы уже организатор этой игры')

  db.transaction(() => {
    db.prepare('UPDATE organizers SET user_id = ?, invited_token = NULL WHERE id = ?').run(
      req.user.id,
      invite.id,
    )
    db.prepare(
      `INSERT INTO events (game_id, kind, text, actor) VALUES (?, ?, ?, ?)`,
    ).run(invite.game_id, 'settings', 'Принято приглашение организатора', 'организатор')
  })()

  res.json({ id: invite.game_id, token: invite.game_token, title: invite.title })
})

organizerInvitesRouter.use((error, _req, res, next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { message: error.message } })
    return
  }
  next(error)
})
