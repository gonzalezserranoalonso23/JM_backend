import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { isValidObjectId } from 'mongoose'
import UserModel from '../models/users.model.js'
import RoleModel, {
  SUDO_USERNAME,
  findSudoRoleId,
  isSudo,
  keepsSchedule,
  rolesAssignableBy
} from '../models/roles.model.js'
import { isApplicationActive } from '../models/appState.model.js'
import { escapeRegex } from '../utils/pagination.js'
import { USER_FIELDS } from '../utils/projections.js'

const TOKEN_TTL = process.env.TOKEN_TTL || '7d'

export const withoutSudoFilter = async () => {
  const sudoId = await findSudoRoleId()
  if (!sudoId) return {}
  return { role: { $ne: sudoId } }
}

export const sudoIsHidden = (actorRole, user) =>
  !isSudo(actorRole) && isSudo(user?.role?.name)

export const withRole = (query) => query.populate('role', 'name')

export const buildUsersFilter = async ({ actorRole, search }) => {
  const filter = isSudo(actorRole) ? {} : await withoutSudoFilter()
  const term = search?.trim()
  if (term) {
    filter.$or = ['username', 'fullName'].map((field) => ({
      [field]: { $regex: escapeRegex(term), $options: 'i' }
    }))
  }
  return filter
}

export const listAssignableUsers = async () =>
  UserModel.find(await withoutSudoFilter(), USER_FIELDS).sort({ username: 1 }).lean()

export const readRole = async (value) => {
  if (value === undefined || value === null || value === '') return undefined
  if (!isValidObjectId(value)) {
    const error = new Error('El rol no es válido')
    error.status = 400
    throw error
  }
  const role = await RoleModel.findById(value).select('_id name').lean()
  if (!role) {
    const error = new Error('El rol no existe')
    error.status = 400
    throw error
  }
  return { id: role._id, name: role.name }
}

export const guardAssignable = (actorRole, nextRole, existing) => {
  const allowed = new Set(rolesAssignableBy(actorRole))
  if (existing?.role?.name && !allowed.has(existing.role.name)) {
    const error = new Error('No puedes editar ese usuario')
    error.status = 403
    throw error
  }
  if (nextRole && !allowed.has(nextRole.name)) {
    const error = new Error('No puedes asignar ese rol')
    error.status = 403
    throw error
  }
}

export const guardSudoRole = (role, username, existing, actorId) => {
  if (existing?.username === SUDO_USERNAME && username !== SUDO_USERNAME) {
    const error = new Error('Ese usuario no se puede renombrar')
    error.status = 400
    throw error
  }
  const ownAccount = existing && String(existing._id) === String(actorId)
  if (
    ownAccount &&
    existing.role?.name === 'Sudo' &&
    role &&
    role.name !== 'Sudo'
  ) {
    const error = new Error('No puedes quitarte el rol Sudo')
    error.status = 400
    throw error
  }
}

export const asBoolean = (value) => {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

const SCHEDULE_DAYS = [
  ['monday', 'lunes'],
  ['tuesday', 'martes'],
  ['wednesday', 'miércoles'],
  ['thursday', 'jueves'],
  ['friday', 'viernes'],
  ['saturday', 'sábado'],
  ['sunday', 'domingo']
]
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export const normalizeSchedule = (value) => {
  const source = value && typeof value === 'object' ? value : {}
  const schedule = {}
  for (const [day, label] of SCHEDULE_DAYS) {
    const row = source[day] || {}
    const enabled = row.enabled === true || row.enabled === 'true'
    const start = String(row.start || '').trim()
    const end = String(row.end || '').trim()
    if (enabled && (!TIME.test(start) || !TIME.test(end) || start >= end)) {
      const error = new Error(
        `Horario inválido el ${label}. La entrada tiene que ser antes de la salida.`
      )
      error.status = 400
      throw error
    }
    schedule[day] = {
      enabled,
      start: enabled ? start : '',
      end: enabled ? end : ''
    }
  }
  return schedule
}

export const authenticateUser = async ({ username, password }) => {
  if (!username || !password) {
    const error = new Error('Usuario y contraseña son requeridos')
    error.status = 400
    throw error
  }
  if (typeof username !== 'string' || typeof password !== 'string') {
    const error = new Error('Datos inválidos')
    error.status = 400
    throw error
  }

  const existUser = await UserModel.findOne({ username }).populate('role', 'name')
  if (!existUser) {
    const error = new Error('Usuario y/o contraseña no válida')
    error.status = 401
    throw error
  }

  const isValid = await bcrypt.compare(password, existUser.password)
  if (!isValid) {
    const error = new Error('Usuario y/o contraseña no válida')
    error.status = 401
    throw error
  }

  const roleName = existUser.role?.name || ''
  if (!isApplicationActive() && !isSudo(roleName)) {
    const error = new Error(
      'Solo un Sudo puede entrar con la aplicación desconectada'
    )
    error.status = 503
    throw error
  }

  const token = jwt.sign(
    {
      id: existUser._id,
      username: existUser.username,
      role: roleName,
      tv: existUser.tokenVersion ?? 0
    },
    process.env.SECURITY_JM,
    { expiresIn: TOKEN_TTL, algorithm: 'HS256' }
  )

  return {
    token,
    username: existUser.username,
    role: roleName,
    shutdown: isApplicationActive() === false
  }
}

export const hashPassword = (password) => bcrypt.hash(password, 10)

export { isSudo, keepsSchedule }
