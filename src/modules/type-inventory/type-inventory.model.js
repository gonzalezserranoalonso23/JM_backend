import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const typeInventorySchema = createSchema({
  typeInventory: {
    type: String,
    required: [true, 'Proporcionar tipo de inventario'],
    trim: true,
    unique: [true, 'El tipo de inventario ya existe']
  },
  stockDirection: {
    type: Number,
    required: [true, 'Proporcionar la dirección del stock'],
    enum: {
      values: [-1, 1],
      message: 'La dirección del stock debe ser 1 o -1'
    }
  }
})

export default mongoose.model('TypeInventory', typeInventorySchema)
