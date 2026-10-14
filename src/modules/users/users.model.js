import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Proporcionar un nombre de usuario'],
    unique: [true, 'El nombre de usuario ya existe']
  },
  password: {
    type: String,
    required: [true, 'Proporcionar un contraseña'],
    unique: false
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
  }
})

export default mongoose.model('User', userSchema)
