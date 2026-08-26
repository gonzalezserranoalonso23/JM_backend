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
  purchasePrice: {
    type: Number,
    required: [true, 'Proporcionar el precio de compra es obligatorio'],
    min: [0, 'El precio de compra no puede ser negativo']
  },
  productPrice: {
    type: Number,
    required: [true, 'Proporcionar el precio de venta es obligatorio'],
    min: [0, 'El precio de venta no puede ser negativo']
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
