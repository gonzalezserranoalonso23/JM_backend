import mongoose from 'mongoose'

const hasInclusiveProjection = (fields) =>
  fields && Object.values(fields).some((value) => value === 1 || value === true)

// Hide __v, including lean reads, unless the query projects fields in.
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
