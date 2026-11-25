import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const root = path.resolve('src')
const banned = [/premium/i, /тариф/i, /подписк/i, /оплат/i, /покупк/i, /окончан\W*доступа/i]

function vueAndJsFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return vueAndJsFiles(full)
    return /\.(vue|js)$/.test(entry.name) ? [full] : []
  })
}

describe('интерфейс', () => {
  it('не упоминает монетизацию и ограничение доступа', () => {
    const files = vueAndJsFiles(root)
    assert.ok(files.length > 0)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      for (const pattern of banned) {
        assert.ok(!pattern.test(content), `${path.relative(root, file)}: ${pattern}`)
      }
    }
  })
})
