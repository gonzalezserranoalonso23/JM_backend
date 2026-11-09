import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const attendanceSchema = createSchema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El usuario es requerido']
  },
  date: {
    type: String,
    required: [true, 'La fecha es requerida']
  },
  checkInAt: {
    type: Date,
    required: [true, 'La hora de entrada es requerida']
  },
  latitude: {
    type: Number
  },
  longitude: {
    type: Number
  },
  checkOutAt: {
    type: Date,
    default: null
  },
  cashReceived: {
    type: Number,
    min: [0, 'Lo que recibes en caja no puede ser negativo']
  },
  cashCut: {
    type: Number,
    min: [0, 'El corte no puede ser negativo'],
    default: null
  }
})

// Una sola entrada abierta por persona. Al registrar la salida se libera.
attendanceSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { checkOutAt: null } }
)
attendanceSchema.index({ date: 1, checkInAt: 1 })
attendanceSchema.index({ user: 1, date: 1, checkInAt: -1 })

export default mongoose.model('Attendance', attendanceSchema)
