import mongoose from 'mongoose'
import { createSchema } from '../config/createSchema.js'
import UserModel from './users.model.js'

export const ROLE_NAMES = ['Sudo', 'Manager', 'Supervisor', 'Staff']
export const RETIRED_ROLE_NAMES = ['User']

export const FULL_ACCESS_ROLES = ['Sudo', 'Manager', 'Supervisor']

export const SUDO_USERNAME = 'glezalonso23'

export const grantsFullAccess = (name) => FULL_ACCESS_ROLES.includes(name)

export const isSudo = (name) => name === 'Sudo'

const ASSIGNABLE_ROLES = {
  Sudo: ROLE_NAMES,
  Manager: ['Manager', 'Supervisor', 'Staff'],
  Supervisor: ['Supervisor', 'Staff']
}

export const SCHEDULE_ROLES = ['Supervisor', 'Staff']

export const rolesAssignableBy = (actor) => ASSIGNABLE_ROLES[actor] || []

export const keepsSchedule = (name) => SCHEDULE_ROLES.includes(name)

// Display order is the privilege list turned around: Staff first, Sudo last.
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

export const ensureRoles = async () => {
  await Promise.all(
    ROLE_NAMES.map((name) =>
      RoleModel.updateOne(
        { name },
        { $setOnInsert: { name } },
        { upsert: true }
      )
    )
  )

  const retiredRoles = await RoleModel.find({
    name: { $in: RETIRED_ROLE_NAMES }
  })
    .select('_id')
    .lean()
  if (!retiredRoles.length) return

  const staffRole = await RoleModel.findOne({ name: 'Staff' })
    .select('_id')
    .lean()
  if (!staffRole) throw new Error('No se encontró el rol Staff para migración')

  const retiredRoleIds = retiredRoles.map((role) => role._id)
  await UserModel.updateMany(
    { role: { $in: retiredRoleIds } },
    { $set: { role: staffRole._id }, $inc: { tokenVersion: 1 } }
  )
  await RoleModel.deleteMany({ _id: { $in: retiredRoleIds } })
}

export default RoleModel
