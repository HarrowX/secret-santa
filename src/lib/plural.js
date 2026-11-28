export function plural(count, forms) {
  const lastTwo = count % 100
  const last = count % 10
  if (last === 1 && lastTwo !== 11) return `${count} ${forms[0]}`
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} ${forms[1]}`
  return `${count} ${forms[2]}`
}
