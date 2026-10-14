import mongoose from 'mongoose'

const typeInventorySchema = new mongoose.Schema({
  typeInventory: {
    type: String,
    required: [true, 'Proporcionar tipo de inventario'],
    unique: [true, 'El tipo de inventario ya existe']
  }
})

export default mongoose.model('TypeInventory', typeInventorySchema)
