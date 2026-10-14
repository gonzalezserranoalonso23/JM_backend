import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const userSchema = createSchema({
  username: {
    type: String,
    required: [true, 'Proporcionar un nombre de usuario'],
    unique: [true, 'El nombre de usuario ya existe']
  },
  password: {
    type: String,
    required: [true, 'Proporcionar una contraseña']
  },
  email: {
    type: String,
    required: [true, 'Proporcionar un correo electronico'],
    unique: true
  },
  fullName: {
    type: String
  },
  isAdmin: {
    type: Boolean
  },
  // Se incrementa para invalidar todos los tokens emitidos del usuario
  tokenVersion: {
    type: Number,
    default: 0
  }
})

userSchema.statics.findAuthState = function (id) {
  return this.findById(id).select('tokenVersion isAdmin').lean()
}

export default mongoose.model('User', userSchema)
