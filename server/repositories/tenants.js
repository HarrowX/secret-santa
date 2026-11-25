import { db } from '../db.js'

export const tenantsRepository = {
  list() {
    return db
      .prepare(
        `
        SELECT tenants.*, games.title AS game_title
        FROM tenants
        JOIN games ON games.id = tenants.game_id
        ORDER BY tenants.id DESC
      `,
      )
      .all()
  },

  findBySlug(slug) {
    return db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug)
  },

  create({ slug, gameId, domain }) {
    return db.prepare('INSERT INTO tenants (slug, game_id, domain) VALUES (?, ?, ?)').run(slug, gameId, domain)
  },
}
