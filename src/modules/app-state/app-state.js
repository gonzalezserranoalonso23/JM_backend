import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

const appStateSchema = createSchema({
  key: { type: String, required: true, unique: true },
  shutdown: { type: Boolean, default: false }
})

const AppState = mongoose.model('AppState', appStateSchema)

const APP_KEY = 'app'
let shutdown = false

export const isShutdown = () => shutdown

export const loadAppState = async () => {
  const state = await AppState.findOne({ key: APP_KEY }).select('shutdown').lean()
  shutdown = Boolean(state?.shutdown)
  return shutdown
}

export const setShutdown = async (value) => {
  const next = Boolean(value)
  await AppState.updateOne(
    { key: APP_KEY },
    { $set: { shutdown: next }, $setOnInsert: { key: APP_KEY } },
    { upsert: true }
  )
  shutdown = next
  return shutdown
}

export default AppState
