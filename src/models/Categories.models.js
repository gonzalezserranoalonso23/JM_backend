import mongoose from 'mongoose'

const CategorySchema = new mongoose.Schema({
  categories: {
    type: String,
    unique: true,
    required: [true, 'Proporcionar una categoría es obligatorio']
  }
})

export default mongoose.model('Category', CategorySchema)
