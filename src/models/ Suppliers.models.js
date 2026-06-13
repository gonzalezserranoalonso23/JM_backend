import mongoose from 'mongoose'

const supplierSchema = new mongoose.Schema({
  suppliersName: {
    type: String,
    required: [true, 'Proporcionar un nombre de proveedor'],
    unique: [true, 'El nombre de proveedor ya existe']
  },
  supplierPhone: {
    type: String,
    required: [true, 'Proporcionar un número de teléfono'],
    unique: true
  },
  supplierContact: {
    type: String,
    required: [true, 'Proporcionar un nombre de contacto'],
    unique: false
  },
  raiseOrder: {
    type: String
  },
  deliverOrder: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
})

export default mongoose.model('Supplier', supplierSchema)
