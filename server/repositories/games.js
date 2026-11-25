import { db } from '../db.js'

export const gamesRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM games WHERE id = ?').get(id)
  },

  findByToken(token) {
    return db.prepare('SELECT * FROM games WHERE token = ?').get(token)
  },

  listForUser(userId) {
    return db
      .prepare(
        `
        SELECT DISTINCT g.*, (SELECT COUNT(*) FROM participants p WHERE p.game_id = g.id) AS participants_count
        FROM games g
        LEFT JOIN organizers o ON o.game_id = g.id AND o.user_id = ?
        LEFT JOIN participants p2 ON p2.game_id = g.id AND p2.user_id = ?
        WHERE o.id IS NOT NULL OR p2.id IS NOT NULL
        ORDER BY g.id DESC
      `,
      )
      .all(userId, userId)
  },
}
