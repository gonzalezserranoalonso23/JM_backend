import mongoose from 'mongoose'
import { createSchema } from '../config/createSchema.js'

// One document identifies the whole application. `active` true means it is on.
const applicationStatusKey = 'app'
// Documents written before this model lived in the default Mongoose collection.
const previousStatusCollection = 'appstates'

const appStatusSchema = createSchema({
  key: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true }
})

const AppStatus = mongoose.model('AppStatus', appStatusSchema)

let applicationIsActive = true

export const isApplicationActive = () => applicationIsActive

const keepApplicationStatus = (active) => {
  applicationIsActive = Boolean(active)
  return applicationIsActive
}

export const loadApplicationStatus = async () => {
  const current = await AppStatus.findOne({ key: applicationStatusKey })
    .select('active')
    .lean()
  if (current) return keepApplicationStatus(current.active)

  const previous = await mongoose.connection
    .collection(previousStatusCollection)
    .findOne({ key: applicationStatusKey })
  if (previous && typeof previous.shutdown === 'boolean') {
    return setApplicationActive(previous.shutdown === false)
  }
  return keepApplicationStatus(true)
}

export const setApplicationActive = async (active) => {
  const nextActive = Boolean(active)
  await AppStatus.updateOne(
    { key: applicationStatusKey },
    {
      $set: { active: nextActive },
      $setOnInsert: { key: applicationStatusKey }
    },
    { upsert: true }
  )
  return keepApplicationStatus(nextActive)
}

export default AppStatus
