import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const taskSchema = createSchema(
  {
    title: {
      type: String,
      required: [true, 'El título es requerido'],
      maxlength: 200
    },
    description: {
      type: String,
      maxlength: 1000
    },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export default mongoose.model('Task', taskSchema)
