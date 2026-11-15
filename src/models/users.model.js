import mongoose from 'mongoose'
import { createSchema } from '../config/createSchema.js'

const shiftSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '' },
    end: { type: String, default: '' }
  },
  { _id: false }
)

const day = () => ({ type: shiftSchema })

const scheduleSchema = new mongoose.Schema(
  {
    monday: day(),
    tuesday: day(),
    wednesday: day(),
    thursday: day(),
    friday: day(),
    saturday: day(),
    sunday: day()
  },
  { _id: false }
)

const userSchema = createSchema({
  username: {
    type: String,
    required: [true, 'Proporcionar un nombre de usuario'],
    unique: [true, 'El nombre de usuario ya existe']
  },
  password: {
    type: String,
    required: [true, 'Proporcionar una contraseña']
  },
  fullName: {
    type: String
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  haveSchedule: {
    type: Boolean,
    default: false
  },
  schedule: {
    type: scheduleSchema,
    default: undefined
  },
  // Bump to invalidate every token already issued for this user.
  tokenVersion: {
    type: Number,
    default: 0
  }
})

userSchema.statics.findAuthState = function (id) {
  return this.findById(id)
    .select('tokenVersion role')
    .populate('role', 'name')
    .lean()
}

const UserModel = mongoose.model('User', userSchema)

// Access comes from the role. Old documents may still store isAdmin.
export const dropLegacyAdminFlag = () =>
  UserModel.collection.updateMany(
    { isAdmin: { $exists: true } },
    { $unset: { isAdmin: '' } }
  )

export const dropLegacyEmail = async () => {
  const indexes = await UserModel.collection.indexes()
  const emailIndex = indexes.find((index) => index.key?.email)
  if (emailIndex) await UserModel.collection.dropIndex(emailIndex.name)
  await UserModel.collection.updateMany(
    { email: { $exists: true } },
    { $unset: { email: '' } }
  )
}

export default UserModel
