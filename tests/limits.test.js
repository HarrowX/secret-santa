import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_ORGANIZERS,
  MAX_ORGANIZERS_WORD,
  MAX_ORGANIZERS_WORD_AFTER_DO,
  MAX_QUESTIONS,
  organizerWordForms,
} from '../limits.js'

describe('limits', () => {
  it('экспортирует текущие лимиты и формы числа', () => {
    assert.equal(MAX_QUESTIONS, 10)
    assert.equal(MAX_ORGANIZERS, 3)
    assert.equal(MAX_ORGANIZERS_WORD, 'три')
    assert.equal(MAX_ORGANIZERS_WORD_AFTER_DO, 'трёх')
  })

  for (const [count, word, afterDo] of [
    [1, 'один', 'одного'],
    [3, 'три', 'трёх'],
    [4, 'четыре', 'четырёх'],
    [5, 'пять', 'пяти'],
  ]) {
    it(`возвращает формы числа ${count}`, () => {
      assert.deepEqual(organizerWordForms(count), { word, afterDo })
    })
  }

  it('бросает ошибку для неподдерживаемого числа', () => {
    assert.throws(() => organizerWordForms(0), /Неподдерживаемое число организаторов: 0/)
    assert.throws(() => organizerWordForms(11), /Неподдерживаемое число организаторов: 11/)
  })
})
