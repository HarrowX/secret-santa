import { db } from '../db.js'

export const tenantsRepository = {
  listForUser(userId) {
    return db
      .prepare(
        `
        SELECT DISTINCT tenants.*, games.title AS game_title
        FROM tenants
        JOIN games ON games.id = tenants.game_id
        LEFT JOIN organizers o ON o.game_id = tenants.game_id AND o.user_id = ?
        LEFT JOIN participants p ON p.game_id = tenants.game_id AND p.user_id = ?
        WHERE o.id IS NOT NULL OR p.id IS NOT NULL
        ORDER BY tenants.id DESC
      `,
      )
      .all(userId, userId)
  },

  findBySlug(slug) {
    return db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug)
  },

  create({ slug, gameId, domain }) {
    return db.prepare('INSERT INTO tenants (slug, game_id, domain) VALUES (?, ?, ?)').run(slug, gameId, domain)
  },
}
