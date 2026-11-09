import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

// Un aviso por persona y día. Evita repetirlo en cada revisión del minuto.
const shiftReminderSchema = createSchema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String,
    required: true
  }
})

shiftReminderSchema.index({ user: 1, date: 1 }, { unique: true })

export default mongoose.model('ShiftReminder', shiftReminderSchema)
