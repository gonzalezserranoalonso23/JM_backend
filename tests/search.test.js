import { describe, expect, it } from 'vitest'
import { accentInsensitiveRegex } from '../src/utils/pagination.js'

const matches = (query, value) =>
  new RegExp(accentInsensitiveRegex(query), 'i').test(value)

describe('accentInsensitiveRegex', () => {
  it('encuentra el producto con o sin acento', () => {
    expect(matches('limon', 'Limón')).toBe(true)
    expect(matches('Limón', 'limon')).toBe(true)
    expect(matches('cafe', 'Café soluble')).toBe(true)
    expect(matches('jalapeño', 'Jalapeno')).toBe(true)
  })

  it('no trata un signo como parte de la regex', () => {
    expect(matches('ana+', 'ana+')).toBe(true)
    expect(matches('ana+', 'anax')).toBe(false)
  })
})
