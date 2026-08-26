import mongoose from 'mongoose'

const OrderSchema = new mongoose.Schema({
  date: {
    type: String,
    required: [true, 'Proporcionar una fecha']
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: [true, 'Proporcionar un proveedor']
  },
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      productName: String,
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
    enum: ['pendiente', 'confirmado', 'completado', 'cancelado'],
    default: 'pendiente'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

export default mongoose.model('Order', OrderSchema)
