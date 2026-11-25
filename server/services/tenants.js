import { gamesRepository } from '../repositories/games.js'
import { tenantsRepository } from '../repositories/tenants.js'

function hostname(host) {
  return String(host || '').replace(/^https?:\/\//, '').split(':')[0].toLowerCase()
}

export function resolveTenant(host, configuredDomain) {
  const current = hostname(host)
  const base = hostname(configuredDomain)
  if (!current || !base || current === base || current === `www.${base}`) return null

  const suffix = `.${base}`
  if (!current.endsWith(suffix)) return null
  const slug = current.slice(0, -suffix.length)
  if (!slug || slug.includes('.')) return null

  const tenant = tenantsRepository.findBySlug(slug)
  if (!tenant) return null
  return { ...tenant, game: gamesRepository.findById(tenant.game_id) }
}
