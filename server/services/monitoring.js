import { db } from '../db.js'

let checkInProgress = false
let monitorTimer = null

function positiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function timeoutMs() {
  return positiveInt(process.env.MONITORING_TIMEOUT_MS, 5000, 100, 60_000)
}

function cleanDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
}

function domainScheme(host) {
  return /^(localhost|127\.0\.0\.1)$/i.test(host) ? 'http' : 'https'
}

function monitoredHosts() {
  const apex = cleanDomain(process.env.DOMAIN_NAME || process.env.DOMAIN || 'localhost') || 'localhost'
  const hosts = [apex]
  const seen = new Set(hosts)
  const tenants = db.prepare('SELECT slug, domain FROM tenants').all()

  for (const tenant of tenants) {
    const base = cleanDomain(tenant.domain || apex) || apex
    const host = `${tenant.slug}.${base}`
    if (!seen.has(host)) {
      seen.add(host)
      hosts.push(host)
    }
  }
  return hosts
}

function clampLimit(value, fallback) {
  return positiveInt(value, fallback, 1, 100_000)
}

function rotateErrors() {
  const keep = clampLimit(process.env.MONITORING_KEEP_ERRORS, 200)
  db.prepare(
    'DELETE FROM monitoring_errors WHERE id NOT IN (SELECT id FROM monitoring_errors ORDER BY id DESC LIMIT ?)',
  ).run(keep)
}

function rotateChecks() {
  const keep = clampLimit(process.env.MONITORING_KEEP_CHECKS, 500)
  db.prepare(
    'DELETE FROM monitoring_checks WHERE id NOT IN (SELECT id FROM monitoring_checks ORDER BY id DESC LIMIT ?)',
  ).run(keep)
}

export function recordError(entry = {}) {
  const row = {
    at: new Date().toISOString(),
    type: String(entry.type || 'unknown').slice(0, 64),
    host: entry.host ? String(entry.host).slice(0, 255) : null,
    path: entry.path ? String(entry.path).slice(0, 255) : null,
    name: entry.name ? String(entry.name).slice(0, 128) : null,
    message: entry.message ? String(entry.message).slice(0, 500) : null,
  }
  db.prepare(
    `
    INSERT INTO monitoring_errors (created_at, type, host, path, name, message)
    VALUES (@at, @type, @host, @path, @name, @message)
  `,
  ).run(row)
  rotateErrors()
  return row
}

export function recentErrors(limit = 20) {
  return db
    .prepare(
      `
      SELECT created_at AS at, type, host, path, name, message
      FROM monitoring_errors
      ORDER BY id DESC
      LIMIT ?
    `,
    )
    .all(clampLimit(limit, 20))
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

async function checkHost(host, { fetcher, scheme, timeout }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const startedAt = Date.now()
  let status = null
  let error = null
  let ok = false
  let recordedFailure = false

  try {
    const response = await fetcher(`${scheme}://${host}/api/health`, {
      signal: controller.signal,
      redirect: 'manual',
    })
    ok = Boolean(response?.ok)
    status = response?.status ?? null
    if (!ok) {
      error = `HTTP ${status}`
      recordError({ type: 'domain_check', host, name: 'HttpError', message: error })
      recordedFailure = true
    }
  } catch (checkError) {
    error = checkError?.name || 'CheckFailed'
    if (!recordedFailure) recordError({ type: 'domain_check', host, name: error })
    recordedFailure = true
  } finally {
    clearTimeout(timer)
  }

  const latencyMs = Date.now() - startedAt
  db.prepare(
    `
    INSERT INTO monitoring_checks (host, ok, status, latency_ms, error)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(host, ok ? 1 : 0, status, latencyMs, error)

  return { host, ok, status, latencyMs, error }
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function sendAlert(failed, { webhookFetcher, timeout }) {
  const url = process.env.MONITORING_WEBHOOK_URL
  if (!url) return

  const payload = JSON.stringify({
    text: 'Secret Santa: доступность доменов нарушена',
    failed: failed.map(({ host, status, error }) => ({ host, status, error })),
  })

  try {
    const response = await webhookFetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(timeout),
    })
    if (!response?.ok) {
      recordError({ type: 'webhook', name: 'WebhookFailed', message: `status=${response?.status ?? 'unknown'}` })
    }
  } catch (error) {
    recordError({ type: 'webhook', name: error?.name || 'WebhookFailed' })
  }
}

export function isMonitoringRunning() {
  return checkInProgress
}

export async function checkDomains({ fetcher = fetch, webhookFetcher = fetch, timeout } = {}) {
  if (checkInProgress) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'monitoring_already_running' }))
    return []
  }

  checkInProgress = true
  try {
    const hosts = monitoredHosts()
    const scheme = domainScheme(hosts[0])
    const runTimeout = timeout || timeoutMs()
    const limit = positiveInt(process.env.MONITORING_CONCURRENCY, 4, 1, 32)
    const results = await mapWithLimit(hosts, limit, (host) =>
      checkHost(host, { fetcher, scheme, timeout: runTimeout }),
    )
    rotateChecks()

    const failed = results.filter((item) => !item.ok)
    if (failed.length > 0) await sendAlert(failed, { webhookFetcher, timeout: runTimeout })
    return results
  } catch (error) {
    recordError({ type: 'monitoring', name: error?.name || 'UnknownError' })
    return []
  } finally {
    checkInProgress = false
  }
}

export const checkSubdomains = checkDomains

export function startMonitoring() {
  if (monitorTimer) return monitorTimer

  const intervalMs = positiveInt(process.env.MONITORING_INTERVAL_MS, 60_000, 1000, 86_400_000)
  const run = async () => {
    const results = await checkDomains()
    const failed = results.filter((item) => !item.ok).length
    console.log(JSON.stringify({ level: 'info', msg: 'monitoring_completed', checked: results.length, failed }))
  }

  void run()
  const timer = setInterval(run, intervalMs)
  timer.unref?.()
  monitorTimer = timer
  return timer
}

export function stopMonitoring() {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}
