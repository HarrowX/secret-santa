import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPassword(value) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(value, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(value, stored) {
  if (!stored) return false
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const actual = scryptSync(value, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return expected.length === actual.length && timingSafeEqual(actual, expected)
}
