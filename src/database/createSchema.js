import mongoose from 'mongoose'

const hasInclusiveProjection = (fields) =>
  fields && Object.values(fields).some((value) => value === 1 || value === true)

// Esquema base: sin __v en documentos nuevos y oculto en los ya existentes
// (incluidas lecturas con .lean()), salvo que la consulta use una proyección inclusiva.
const stripVersion = (_doc, ret) => {
  if (ret && typeof ret === 'object') delete ret.__v
  return ret
}

export const createSchema = (definition, options = {}) => {
  const schema = new mongoose.Schema(definition, {
    versionKey: false,
    ...options
  })
  schema.set('toJSON', { transform: stripVersion })
  schema.set('toObject', { transform: stripVersion })
  schema.pre(/^find/, function () {
    if (!hasInclusiveProjection(this._fields)) this.select('-__v')
  })
  schema.pre('aggregate', function () {
    this.pipeline().push({ $unset: '__v' })
  })
  return schema
}
