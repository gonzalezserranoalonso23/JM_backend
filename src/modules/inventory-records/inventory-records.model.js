import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const InventoryRecordSchema = createSchema({
  date: {
    type: String,
    required: [true, 'Proporcionar un fecha']
  },
  typeInventory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TypeInventory',
    required: [true, 'Proporcionar un tipo de inventario']
  },
  productName: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Proporcionar un nombre de producto']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Proporcionar un nombre de categoría']
  },
  productPrice: {
    type: String,
    required: [true, 'Proporcionar el precio del producto']
  },
  // Costo del producto al momento del movimiento. Las salidas lo usan para
  // que la utilidad no cambie si después se edita el precio de compra.
  purchasePrice: {
    type: Number,
    min: [0, 'El precio de compra no puede ser negativo']
  },
  quantity: {
    type: Number,
    required: [true, 'Proporcionar un cantidad']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Proporcionar un monto']
  },
  paymentType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentType',
    default: null
  },
  User: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Proporcionar un usuario']
  }
})

InventoryRecordSchema.index({ date: 1, typeInventory: 1, paymentType: 1 })

export default mongoose.model('InventoryRecord', InventoryRecordSchema)
