import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const denominationSchema = createSchema({
  value: {
    type: Number,
    required: [true, 'La denominación es requerida'],
    unique: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: null
  }
})

export default mongoose.model('Denomination', denominationSchema)
