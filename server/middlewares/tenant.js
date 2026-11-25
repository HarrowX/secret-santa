import { resolveTenant } from '../services/tenants.js'

export function tenantMiddleware(req, _res, next) {
  req.tenant = resolveTenant(req.headers.host, process.env.DOMAIN)
  next()
}
