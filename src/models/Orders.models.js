import mongoose from 'mongoose'

const OrderSchema = new mongoose.Schema({
  date: {
    type: String,
    required: [true, 'Proporcionar un fecha']
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: [true, 'Proporcionar un nombre de proveedor']
  },
  order: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Proporcionar un nombre de producto']
      },
      quantity: {
        type: Number,
        required: [true, 'Proporcionar un cantidad']
      }
    }
  ],
  status: {
    type: Boolean,
    default: true
  }
})

export default mongoose.model('Order', OrderSchema)
