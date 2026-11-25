import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '.env')
const errors = []

function parseEnvFile(content) {
  const values = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    values[match[1]] = value
  }
  return values
}

let fileEnv = {}
try {
  fileEnv = parseEnvFile(fs.readFileSync(envPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') errors.push(`.env: не удалось прочитать файл (${error.code || 'UnknownError'})`)
}
const env = { ...fileEnv, ...process.env }

function requireDomain(name) {
  const value = env[name]?.trim()
  if (!value) {
    errors.push(`${name}: обязательная переменная`)
    return
  }
  if (!/^[a-z0-9.-]+$/i.test(value) || value.startsWith('.') || value.endsWith('.') || value.includes('..')) {
    errors.push(`${name}: ожидается домен без схемы и пути, например santa.local`)
  }
}

function parseUrl(name, required = true) {
  const value = env[name]?.trim()
  if (!value) {
    if (required) errors.push(`${name}: обязательная переменная`)
    return null
  }
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${name}: разрешены только http и https`)
      return null
    }
    return url
  } catch {
    errors.push(`${name}: некорректный URL`)
    return null
  }
}

const isProduction = env.NODE_ENV === 'production'
const appUrl = parseUrl('APP_URL')
parseUrl('VITE_APP_URL', false)
if (appUrl && isProduction) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i.test(appUrl.hostname)
  if (local && env.ALLOW_LOCAL_APP_URL !== 'true') {
    errors.push('APP_URL: в production нельзя localhost; укажите публичный URL или ALLOW_LOCAL_APP_URL=true для стейджа')
  }
}

requireDomain('DOMAIN')
if (env.DOMAIN_NAME?.trim()) requireDomain('DOMAIN_NAME')

const numericRanges = [
  ['PORT', 1, 65_535, true],
  ['BACKUP_RETENTION', 1, 365, false],
  ['BACKUP_INTERVAL_SECONDS', 60, 31_536_000, false],
  ['MONITORING_INTERVAL_MS', 1000, 86_400_000, false],
  ['MONITORING_TIMEOUT_MS', 100, 60_000, false],
  ['MONITORING_CONCURRENCY', 1, 32, false],
  ['MONITORING_KEEP_CHECKS', 1, 100_000, false],
  ['MONITORING_KEEP_ERRORS', 1, 100_000, false],
]
for (const [name, min, max, required] of numericRanges) {
  const raw = env[name]?.trim()
  if (!raw) {
    if (required) errors.push(`${name}: обязательная числовая переменная`)
    continue
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${name}: ожидается целое число от ${min} до ${max}`)
  }
}

const caddyfile = env.CADDYFILE?.trim()
if (!caddyfile) {
  errors.push('CADDYFILE: обязательная переменная, например Caddyfile.internal')
} else if (path.basename(caddyfile) !== caddyfile) {
  errors.push('CADDYFILE: ожидается имя файла в корне проекта без пути')
} else if (!fs.existsSync(path.join(root, caddyfile))) {
  errors.push(`CADDYFILE: файл ${caddyfile} не найден`)
} else if (caddyfile.toLowerCase().includes('wildcard') && !env.CLOUDFLARE_API_TOKEN?.trim()) {
  errors.push('CLOUDFLARE_API_TOKEN: обязателен для wildcard-конфигурации Caddy')
}

if (env.MONITORING_WEBHOOK_URL?.trim()) parseUrl('MONITORING_WEBHOOK_URL', false)

if (errors.length > 0) {
  for (const message of errors) console.error(`- ${message}`)
  console.error(`Окружение невалидно: ошибок — ${errors.length}.`)
  process.exit(1)
}

console.log('OK: окружение валидно')
