import { db } from './db.js'
import { fail } from './http-error.js'

export function requireOrganizer(gameId, user) {
  const accepted = db.prepare('SELECT user_id FROM organizers WHERE game_id = ? AND user_id IS NOT NULL').all(gameId)
  if (!accepted.length) return
  if (!user || !accepted.some((organizer) => organizer.user_id === user.id)) {
    fail(403, 'Только организатор может выполнять это действие')
  }
}
