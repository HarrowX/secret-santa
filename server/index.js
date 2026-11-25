import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { startMonitoring } from './services/monitoring.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  process.loadEnvFile(path.join(root, '.env'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const port = process.env.PORT || 3000

createApp().listen(port, () => {
  console.log(JSON.stringify({ level: 'info', msg: 'server_started', port }))
  if (process.env.MONITORING_ENABLED === 'true') startMonitoring()
})
