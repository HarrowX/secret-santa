function shuffled(values) {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

export function drawPairs({ ids, exclusions = new Set(), manual = new Map() }) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const order = shuffled(ids)
    const candidate = new Map(ids.map((from, index) => [from, order[(index + 1) % order.length]]))
    const valid = ids.every((from) => {
      const to = candidate.get(from)
      return from !== to && !exclusions.has(`${from}:${to}`) && (!manual.has(from) || manual.get(from) === to)
    })
    if (valid) return candidate
  }
  return null
}
