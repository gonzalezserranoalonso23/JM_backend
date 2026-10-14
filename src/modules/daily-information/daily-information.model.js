import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const DailyInformationSchema = createSchema({
  date: {
    type: String,
    required: [true, 'Proporcionar un fecha']
  },
  cashSales: {
    type: Number,
    required: [true, 'Proporcionar un total de ventas en efectivo']
  },
  cardSales: {
    type: Number,
    required: [true, 'Proporcionar un total de ventas con tarjeta']
  },
  totalSales: {
    type: Number,
    required: [true, 'Proporcionar un total de ventas']
  },

  totalTransactions: {
    type: Number,
    required: [true, 'Proporcionar un total de transacciones']
  }
})

export default mongoose.model('DailyInformation', DailyInformationSchema)
