import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const OrderSchema = createSchema(
  {
    date: {
      type: String,
      required: [true, 'Proporcionar una fecha']
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier'
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product'
        },
        productName: String,
        supplier: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Supplier'
        },
        quantity: {
          type: Number,
          required: [true, 'Proporcionar cantidad']
        },
        price: {
          type: Number,
          required: [true, 'Proporcionar precio']
        },
        subtotal: Number
      }
    ],
    totalAmount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['pendiente', 'confirmado'],
      default: 'pendiente'
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export default mongoose.model('Order', OrderSchema)
