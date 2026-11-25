import { db } from '../db.js'

const errors = []
const maxErrors = 50

export function recordError(entry) {
  errors.unshift({ at: new Date().toISOString(), ...entry })
  if (errors.length > maxErrors) errors.length = maxErrors
}

export function recentErrors(limit = 20) {
  return errors.slice(0, limit)
}

export function latestChecks() {
  return db
    .prepare(
      `
      SELECT host, ok, status, latency_ms, error, created_at
      FROM monitoring_checks
      WHERE id IN (SELECT MAX(id) FROM monitoring_checks GROUP BY host)
      ORDER BY host
    `,
    )
    .all()
}

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

function domainScheme(domain) {
  return /^(localhost|127\.0\.0\.1)(:|$)/.test(domain) ? 'http' : 'https'
}

export async function checkSubdomains({ fetcher = fetch } = {}) {
  const domain = cleanDomain(process.env.DOMAIN_NAME || process.env.DOMAIN || 'localhost')
  const scheme = domainScheme(domain)
  const timeoutMs = Number.parseInt(process.env.MONITORING_TIMEOUT_MS || '5000', 10)
  const tenants = db.prepare('SELECT slug, domain FROM tenants').all()
  const results = []

  for (const tenant of tenants) {
    const host = `${tenant.slug}.${cleanDomain(tenant.domain || domain)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = Date.now()
    let status = null
    let error = null
    let ok = false

    try {
      const response = await fetcher(`${scheme}://${host}/api/health`, {
        signal: controller.signal,
        redirect: 'manual',
      })
      ok = Boolean(response.ok)
      status = response.status ?? null
      if (!ok) error = `HTTP ${status}`
    } catch (checkError) {
      error = checkError?.name || 'CheckFailed'
      recordError({ type: 'domain_check', host, name: error })
    } finally {
      clearTimeout(timer)
    }

    const latencyMs = Date.now() - startedAt
    db.prepare(
      `
      INSERT INTO monitoring_checks (host, ok, status, latency_ms, error) VALUES (?, ?, ?, ?, ?)
    `,
    ).run(host, ok ? 1 : 0, status, latencyMs, error)
    results.push({ host, ok, status, latencyMs, error })
  }

  return results
}

export function startMonitoring() {
  const intervalMs = Number.parseInt(process.env.MONITORING_INTERVAL_MS || '60000', 10)
  const run = () =>
    checkSubdomains()
      .then((results) => {
        const failed = results.filter((item) => !item.ok).length
        console.log(JSON.stringify({ level: 'info', msg: 'monitoring_completed', checked: results.length, failed }))
      })
      .catch((error) => recordError({ type: 'monitoring', name: error?.name || 'UnknownError' }))

  run()
  const timer = setInterval(run, intervalMs)
  timer.unref?.()
  return timer
}
