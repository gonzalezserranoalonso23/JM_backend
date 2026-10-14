import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const paymentTypeSchema = createSchema({
  paymentType: {
    type: String,
    required: [true, 'Proporcionar un tipo de pago'],
    trim: true,
    unique: [true, 'El tipo de pago ya existe']
  }
})

export default mongoose.model('PaymentType', paymentTypeSchema)
