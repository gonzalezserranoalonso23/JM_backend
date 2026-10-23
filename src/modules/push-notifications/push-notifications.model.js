import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const pushSubscriptionSchema = createSchema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    endpoint: {
      type: String,
      required: true,
      unique: true
    },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    expirationTime: {
      type: Date,
      default: null
    }
  },
  { timestamps: { createdAt: true, updatedAt: true } }
)

export default mongoose.model('PushSubscription', pushSubscriptionSchema)
