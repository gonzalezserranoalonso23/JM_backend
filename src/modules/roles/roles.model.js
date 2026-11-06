import mongoose from 'mongoose'
import { createSchema } from '../../database/createSchema.js'

export const ROLE_NAMES = ['Manager', 'Supervisor', 'Staff', 'User']

export const FULL_ACCESS_ROLES = ['Manager', 'Supervisor']

export const grantsFullAccess = (name) => FULL_ACCESS_ROLES.includes(name)

const roleSchema = createSchema({
  name: {
    type: String,
    required: [true, 'Proporcionar un rol'],
    unique: true,
    trim: true,
    enum: {
      values: ROLE_NAMES,
      message: 'El rol debe ser Manager, Supervisor, Staff o User'
    }
  }
})

const RoleModel = mongoose.model('Role', roleSchema)

export const ensureRoles = () =>
  Promise.all(
    ROLE_NAMES.map((name) =>
      RoleModel.updateOne(
        { name },
        { $setOnInsert: { name } },
        { upsert: true }
      )
    )
  )

export default RoleModel
