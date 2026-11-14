import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

export const ORDER_STATUS = {
  pending: 'pendiente',
  confirmed: 'confirmado'
}

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
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.pending
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

OrderSchema.index({ status: -1, date: -1 })

export default mongoose.model('Order', OrderSchema)
