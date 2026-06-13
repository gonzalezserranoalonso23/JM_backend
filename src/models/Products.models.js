import mongoose from 'mongoose'

const ProductSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: [true, 'Proporcionar un nombre de producto es obligatorio']
  },
  productDescription: {
    type: String,
    required: [true, 'Proporcionar una descripción es obligatorio']
  },
  productPrice: {
    type: Number,
    required: [true, 'Proporcionar un precio es obligatorio']
  },
  productStock: {
    type: Number,
    required: [true, 'Proporcionar un stock es obligatorio']
  },
  minimumProductStock: {
    type: Number,
    required: [true, 'Proporcionar un stock es obligatorio']
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
  }
})

export default mongoose.model('Product', ProductSchema)
