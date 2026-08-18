import mongoose from 'mongoose'

const supplierSchema = new mongoose.Schema({
  suppliersName: {
    type: String,
    required: [true, 'Proporcionar un nombre de proveedor'],
    unique: [true, 'El nombre de proveedor ya existe']
  },
  suppliersContact: {
    type: String,
    required: [true, 'Proporcionar un contacto de proveedor']
  },
  supplierPhone: {
    type: String,
    required: [true, 'Proporcionar un número de teléfono'],
    unique: true
  },

  raiseOrder: {
    type: String
  },
  deliverOrder: {
    type: String
  },
  isActive: {
    type: Boolean
  }
})

export default mongoose.model('Supplier', supplierSchema)
