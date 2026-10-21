import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const maxThreeDecimals = {
  validator: (v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6,
  message: 'Solo se permiten hasta 3 decimales'
}

const ProductSchema = createSchema({
  productName: {
    type: String,
    required: [true, 'Proporcionar un nombre de producto es obligatorio']
  },
  productDescription: {
    type: String,
    required: [true, 'Proporcionar una descripción es obligatorio']
  },
  purchasePrice: {
    type: Number,
    validate: maxThreeDecimals,
    required: [true, 'Proporcionar el precio de compra es obligatorio'],
    min: [0, 'El precio de compra no puede ser negativo']
  },
  productPrice: {
    type: Number,
    validate: maxThreeDecimals,
    required: [true, 'Proporcionar el precio de venta es obligatorio'],
    min: [0, 'El precio de venta no puede ser negativo']
  },
  productStock: {
    type: Number,
    validate: maxThreeDecimals,
    required: [true, 'Proporcionar un stock es obligatorio']
  },
  minimumProductStock: {
    type: Number,
    validate: maxThreeDecimals,
    required: [true, 'Proporcionar un stock mínimo es obligatorio']
  },
  supplier: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'Supplier',
    required: [true, 'Proporcionar un proveedor es obligatorio']
  },
  category: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'Category',
    required: [true, 'Proporcionar una categoría es obligatorio']
  },
  isActive: {
    type: Boolean,
    default: true
  }
})

export default mongoose.model('Product', ProductSchema)
