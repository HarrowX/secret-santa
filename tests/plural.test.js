import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { plural } from '../src/lib/plural.js'

describe('plural', () => {
  const answerForms = ['ответ', 'ответа', 'ответов']
  const themeForms = ['оформление', 'оформления', 'оформлений']

  for (const [count, answer, theme] of [
    [0, '0 ответов', '0 оформлений'],
    [1, '1 ответ', '1 оформление'],
    [2, '2 ответа', '2 оформления'],
    [5, '5 ответов', '5 оформлений'],
    [11, '11 ответов', '11 оформлений'],
    [21, '21 ответ', '21 оформление'],
    [22, '22 ответа', '22 оформления'],
    [25, '25 ответов', '25 оформлений'],
  ]) {
    it(`склоняет число ${count}`, () => {
      assert.equal(plural(count, answerForms), answer)
      assert.equal(plural(count, themeForms), theme)
    })
  }
})
