import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const CategorySchema = createSchema({
  categories: {
    type: String,
    unique: true,
    required: [true, 'Proporcionar una categoría es obligatorio']
  }
})

export default mongoose.model('Category', CategorySchema)
