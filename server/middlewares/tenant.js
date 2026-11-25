import { resolveTenant } from '../services/tenants.js'

export function tenantMiddleware(req, _res, next) {
  const host = req.get('x-forwarded-host') || req.headers.host
  req.tenant = resolveTenant(host, process.env.DOMAIN_NAME || process.env.DOMAIN)
  next()
}
