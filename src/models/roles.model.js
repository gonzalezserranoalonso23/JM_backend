import mongoose from 'mongoose'
import { createSchema } from '../config/createSchema.js'

export const ROLE_NAMES = ['Sudo', 'Manager', 'Supervisor', 'Staff', 'User']

export const FULL_ACCESS_ROLES = ['Sudo', 'Manager', 'Supervisor']

export const SUDO_USERNAME = 'glezalonso23'

export const grantsFullAccess = (name) => FULL_ACCESS_ROLES.includes(name)

export const isSudo = (name) => name === 'Sudo'

const ASSIGNABLE_ROLES = {
  Sudo: ROLE_NAMES,
  Manager: ['Manager', 'Supervisor', 'Staff', 'User'],
  Supervisor: ['Supervisor', 'Staff', 'User']
}

export const SCHEDULE_ROLES = ['Supervisor', 'Staff', 'User']

export const rolesAssignableBy = (actor) => ASSIGNABLE_ROLES[actor] || []

export const keepsSchedule = (name) => SCHEDULE_ROLES.includes(name)

// Display order is the privilege list turned around: User first, Sudo last.
export const roleRank = (name) => {
  const index = ROLE_NAMES.indexOf(name)
  if (index === -1) return ROLE_NAMES.length
  return ROLE_NAMES.length - 1 - index
}

export const findSudoRoleId = async () => {
  const role = await RoleModel.findOne({ name: 'Sudo' }).select('_id').lean()
  return role?._id || null
}

const roleSchema = createSchema({
  name: {
    type: String,
    required: [true, 'Proporcionar un rol'],
    unique: true,
    trim: true,
    maxlength: [40, 'El rol es demasiado largo']
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

export const ensureSudoOwner = async () => {
  const { default: UserModel } = await import('./users.model.js')
  const role = await RoleModel.findOne({ name: 'Sudo' }).select('_id')
  if (!role) return
  await UserModel.updateOne(
    { username: SUDO_USERNAME },
    { $set: { role: role._id } }
  )
}

export default RoleModel
