import fs from 'node:fs'
import Database from 'better-sqlite3'

const dbPath = './data/browser-test.sqlite'

export default async function globalSetup() {
  if (!fs.existsSync(dbPath)) return

  const database = new Database(dbPath)
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('schema_migrations', 'themes')")
    .all()
    .map((row) => row.name)

  database.pragma('foreign_keys = OFF')
  const reset = database.transaction(() => {
    for (const table of tables) {
      database.prepare(`DELETE FROM ${table}`).run()
    }
    if (tables.includes('sqlite_sequence')) {
      database.prepare("DELETE FROM sqlite_sequence WHERE name NOT IN ('schema_migrations', 'themes')").run()
    }
  })
  reset()
  database.close()
}
