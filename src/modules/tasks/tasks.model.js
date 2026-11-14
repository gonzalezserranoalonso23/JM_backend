import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

export const TASK_STATUS = {
  pending: 'pending',
  completed: 'completed'
}

export const TASK_PRIORITY = {
  low: 'low',
  medium: 'medium',
  high: 'high'
}

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
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.pending
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.medium
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

taskSchema.index({ status: 1, createdAt: -1 })
taskSchema.index({ status: 1, completedAt: -1 })

export default mongoose.model('Task', taskSchema)
