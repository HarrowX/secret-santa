import { applyMigrations, createDatabase } from '../server/migrations.js'

const database = createDatabase()
try {
  const result = applyMigrations(database)
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'migrations_applied',
      applied: result.applied,
      total: result.total,
    }),
  )
} finally {
  database.close()
}
