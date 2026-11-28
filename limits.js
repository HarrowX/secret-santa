export const MAX_QUESTIONS = 10
export const MAX_ORGANIZERS = 3

const wordForms = new Map([
  [1, { word: 'один', afterDo: 'одного' }],
  [2, { word: 'два', afterDo: 'двух' }],
  [3, { word: 'три', afterDo: 'трёх' }],
  [4, { word: 'четыре', afterDo: 'четырёх' }],
  [5, { word: 'пять', afterDo: 'пяти' }],
  [6, { word: 'шесть', afterDo: 'шести' }],
  [7, { word: 'семь', afterDo: 'семи' }],
  [8, { word: 'восемь', afterDo: 'восьми' }],
  [9, { word: 'девять', afterDo: 'девяти' }],
  [10, { word: 'десять', afterDo: 'десяти' }],
])

export function organizerWordForms(count) {
  const forms = wordForms.get(count)
  if (!forms) throw new Error(`Неподдерживаемое число организаторов: ${count}`)
  return forms
}

const currentForms = organizerWordForms(MAX_ORGANIZERS)
export const MAX_ORGANIZERS_WORD = currentForms.word
export const MAX_ORGANIZERS_WORD_AFTER_DO = currentForms.afterDo
