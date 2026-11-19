import mongoose from 'mongoose'
import { createSchema } from '../config/createSchema.js'

const supplierPaymentSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'El proveedor es requerido']
    },
    amount: {
      type: Number,
      required: [true, 'La cantidad pagada es requerida'],
      min: [0, 'La cantidad pagada no puede ser negativa']
    }
  },
  { _id: false }
)

const attendanceSchema = createSchema(
  {
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
    closedAt: {
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
    },
    supplierPayments: {
      type: [supplierPaymentSchema],
      default: []
    }
  },
  { autoIndex: false }
)

// One open shift per person. Checkout or end-of-day closure releases the index.
attendanceSchema.index(
  { user: 1 },
  {
    unique: true,
    name: 'one_open_shift_per_user_v2',
    partialFilterExpression: { checkOutAt: null, closedAt: null }
  }
)
attendanceSchema.index({ date: 1, checkInAt: 1 })
attendanceSchema.index({ user: 1, date: 1, checkInAt: -1 })

const Attendance = mongoose.model('Attendance', attendanceSchema)

export const ensureAttendanceIndexes = async () => {
  const collection = Attendance.collection
  const collections = await Attendance.db.db
    .listCollections({ name: collection.collectionName }, { nameOnly: true })
    .toArray()
  if (collections.length === 0) await Attendance.createCollection()

  const indexes = await collection.indexes()
  const legacyOpenIndex = indexes.find((index) => {
    const checkOutFilter = index.partialFilterExpression?.checkOutAt
    return (
      index.unique &&
      Object.keys(index.key).length === 1 &&
      index.key.user === 1 &&
      (checkOutFilter === null || checkOutFilter?.$eq === null) &&
      !Object.hasOwn(index.partialFilterExpression, 'closedAt')
    )
  })
  if (legacyOpenIndex) await collection.dropIndex(legacyOpenIndex.name)

  await Attendance.createIndexes()
}

export default Attendance
