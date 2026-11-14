import { accentInsensitiveRegex } from './pagination.js'

const WORD = /[a-z0-9]+/g
const FILLER = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'a',
  'en',
  'con',
  'un',
  'una',
  'por',
  'para',
  'al',
  'lo'
])

export const foldText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

// "coca de 600" keeps coca and 600. Filler words are not required in the name.
export const searchTokens = (query) => {
  const tokens = foldText(query).match(WORD) ?? []
  return tokens.filter((token) => token.length > 1 && !FILLER.has(token))
}

// Every token must appear, in any order, in one of the fields.
export const productTokenMatch = (
  tokens,
  fields = ['productName', 'productDescription']
) => ({
  $and: tokens.map((token) => ({
    $or: fields.map((field) => ({
      [field]: { $regex: accentInsensitiveRegex(token), $options: 'i' }
    }))
  }))
})
