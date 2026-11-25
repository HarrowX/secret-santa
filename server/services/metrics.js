import { db } from '../db.js'

export const metricKinds = ['game_created', 'participant_invited', 'draw_completed', 'gift_sent', 'organizer_return']

export function trackMetric(kind, { gameId = null, userId = null } = {}) {
  if (!metricKinds.includes(kind)) return
  db.prepare('INSERT INTO metrics (game_id, user_id, kind) VALUES (?, ?, ?)').run(gameId, userId, kind)
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0
}

export function metricsSummary() {
  const rows = db
    .prepare(
      `
      SELECT kind, COUNT(DISTINCT game_id) AS games
      FROM metrics
      WHERE game_id IS NOT NULL
      GROUP BY kind
    `,
    )
    .all()
  const gamesByKind = Object.fromEntries(rows.map((row) => [row.kind, row.games]))
  const returning = db
    .prepare(
      `
      SELECT COUNT(DISTINCT user_id) AS total
      FROM metrics
      WHERE kind = 'organizer_return' AND user_id IS NOT NULL
    `,
    )
    .get().total
  const created = gamesByKind.game_created ?? 0
  const stages = [
    { key: 'game_created', title: 'Создана игра', count: created },
    { key: 'participant_invited', title: 'Приглашены участники', count: gamesByKind.participant_invited ?? 0 },
    { key: 'draw_completed', title: 'Проведена жеребьёвка', count: gamesByKind.draw_completed ?? 0 },
    { key: 'gift_sent', title: 'Отправлен подарок', count: gamesByKind.gift_sent ?? 0 },
    { key: 'organizer_return', title: 'Организатор вернулся', count: returning },
  ].map((stage) => ({ ...stage, conversion: percent(stage.count, created) }))
  return { stages, updatedAt: new Date().toISOString() }
}
