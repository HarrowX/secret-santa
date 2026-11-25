import fs from 'node:fs'

const dbPath = './data/browser-test.sqlite'

export default async function globalSetup() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true })
  }
}
