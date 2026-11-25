import { db } from '../db.js'

export const gamesRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM games WHERE id = ?').get(id)
  },

  findByToken(token) {
    return db.prepare('SELECT * FROM games WHERE token = ?').get(token)
  },

  list() {
    return db
      .prepare(
        `
        SELECT g.*, (SELECT COUNT(*) FROM participants p WHERE p.game_id = g.id) AS participants_count
        FROM games g
        ORDER BY g.id DESC
      `,
      )
      .all()
  },
}
