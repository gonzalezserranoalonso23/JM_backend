/**
 * Users and auth. Base: /api/users
 *
 * POST   /login       { username, password }. Public, 10 attempts / 15 min.
 * POST   /register    { username, password, fullName, role, haveSchedule, schedule }. Full access.
 * GET    /assignable  { username, fullName } for task assignment.
 * GET    /me          Signed-in profile, including schedule.
 * GET    /            query { page, limit, search }. Full access.
 * GET    /:id         params { id }. Full access.
 * PUT    /:id         params { id }, { username, password, fullName, role, haveSchedule, schedule }. Full access.
 * DELETE /:id         params { id }. Full access.
 * POST   /logout      Closes the signed-in sessions.
 * POST   /:id/logout  Sudo closes another session. A Sudo account stays open.
 * password is never returned.
 */
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import UserModel from './users.model.js'
import RoleModel, {
  SUDO_USERNAME,
  findSudoRoleId,
  isSudo,
  keepsSchedule,
  rolesAssignableBy
} from '../roles/roles.model.js'
import { isShutdown } from '../app-state/app-state.js'
import { isValidObjectId } from 'mongoose'
import dotenv from 'dotenv'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../../utils/pagination.js'
import { USER_FIELDS } from '../../utils/projections.js'
dotenv.config()

const TOKEN_TTL = process.env.TOKEN_TTL || '7d'

const withoutSudo = async () => {
  const sudoId = await findSudoRoleId()
  if (!sudoId) return {}
  return { role: { $ne: sudoId } }
}

const sudoIsHidden = (actorRole, user) =>
  !isSudo(actorRole) && isSudo(user?.role?.name)

const getAssignableUsers = async (req, res) => {
  try {
    const users = await UserModel.find(await withoutSudo(), USER_FIELDS)
      .sort({ username: 1 })
      .lean()
    res.status(200).json(users)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al obtener usuarios',
    })
  }
}

const getUsers = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const search = req.query?.search?.trim()
    const filter = isSudo(req.role) ? {} : await withoutSudo()
    if (search) {
      filter.$or = ['username', 'fullName'].map((field) => ({
        [field]: { $regex: escapeRegex(search), $options: 'i' }
      }))
    }
    const query = withRole(
      UserModel.find(filter).select('-password -tokenVersion')
    )

    if (!pagination.requested) {
      const data = await query
      return res.status(200).json(data)
    }

    const [data, total] = await Promise.all([
      query.sort({ username: 1 }).skip(pagination.skip).limit(pagination.limit),
      UserModel.countDocuments(filter)
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cargar los usuarios' })
  }
}

const getCurrentUser = async (req, res) => {
  try {
    const data = await withRole(
      UserModel.findById(req.userId).select('-password -tokenVersion')
    )
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cargar el perfil' })
  }
}

const getUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await withRole(
      UserModel.findById(id).select('-password -tokenVersion')
    )
    if (!data || sudoIsHidden(req.role, data))
      return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cargar el usuario' })
  }
}

const loginUser = async (req, res) => {
  const { username, password } = req.body
  if (!username || !password)
    return res
      .status(400)
      .json({ message: 'Usuario y contraseña son requeridos' })
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(400).json({ message: 'Datos inválidos' })
  try {
    const loginQuery = UserModel.findOne({ username })
    let existUser = loginQuery
    if (typeof loginQuery?.populate === 'function') {
      existUser = await loginQuery.populate('role', 'name')
    } else {
      existUser = await loginQuery
    }
    if (!existUser)
      return res
        .status(401)
        .json({ message: 'Usuario y/o contraseña no válida' })

    const isValid = await bcrypt.compare(password, existUser.password)
    if (!isValid)
      return res
        .status(401)
        .json({ message: 'Usuario y/o contraseña no válida' })

    const roleName = existUser.role?.name || ''
    if (isShutdown() && !isSudo(roleName)) {
      return res.status(503).json({
        message: 'La aplicación está desconectada',
        shutdown: true
      })
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
    res.status(200).json({
      token,
      username: existUser.username,
      role: roleName
    })
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al iniciar sesión' })
  }
}

const withRole = (query) => query.populate('role', 'name')

const readRole = async (value) => {
  if (value === undefined || value === null || value === '') return undefined
  if (!isValidObjectId(value)) {
    const error = new Error('El rol no es válido')
    error.status = 400
    throw error
  }
  const role = await RoleModel.findById(value).select('_id name')
  if (!role) {
    const error = new Error('El rol no existe')
    error.status = 400
    throw error
  }
  return { id: role._id, name: role.name }
}

const guardAssignable = (actorRole, nextRole, existing) => {
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

const guardSudoRole = (role, username, existing, actorId) => {
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

const asBoolean = (value) => {
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

const normalizeSchedule = (value) => {
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

const sendUserError = (res, error, fallback) => {
  if (!error.status) console.error(error)
  res.status(error.status || 500).json({
    message: error.status ? error.message : fallback
  })
}

const registerUser = async (req, res) => {
  const { username, password, fullName } = req.body
  if (!username || !password)
    return res
      .status(400)
      .json({ message: 'Usuario y contraseña son requeridos' })
  try {
    const existUser = await UserModel.findOne({ username })
    if (existUser)
      return res.status(409).json({ message: 'El usuario ya existe' })

    const passCrypt = await bcrypt.hash(password, 10)
    const role = await readRole(req.body.role)
    guardSudoRole(role, username)
    guardAssignable(req.role, role)
    const withSchedule =
      keepsSchedule(role?.name) && asBoolean(req.body.haveSchedule) === true
    const newUser = new UserModel({
      username,
      password: passCrypt,
      fullName,
      ...(role ? { role: role.id } : {}),
      haveSchedule: withSchedule,
      ...(withSchedule
        ? { schedule: normalizeSchedule(req.body.schedule) }
        : {})
    })
    const saved = await newUser.save()
    res.status(201).json({ username: saved.username })
  } catch (error) {
    sendUserError(res, error, 'Error al registrar el usuario')
  }
}

const updateUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  const { username, password, fullName } = req.body
  try {
    // password is optional on edit. Only sent fields change.
    const existing = await UserModel.findById(id)
      .select('username role')
      .populate('role', 'name')
    if (!existing || sudoIsHidden(req.role, existing))
      return res.status(404).json({ message: 'Usuario no encontrado' })
    const role = await readRole(req.body.role)
    guardSudoRole(role, username || existing.username, existing, req.userId)
    guardAssignable(req.role, role, existing)
    const effectiveRole = role?.name || existing.role?.name
    const haveSchedule =
      effectiveRole && !keepsSchedule(effectiveRole)
        ? false
        : asBoolean(req.body.haveSchedule)
    const update = Object.fromEntries(
      Object.entries({
        username,
        fullName,
        role: role ? role.id : undefined,
        haveSchedule
      }).filter(([, value]) => value !== undefined)
    )
    const clearSchedule = haveSchedule === false
    if (haveSchedule === true) {
      update.schedule = normalizeSchedule(req.body.schedule)
    }
    const revokeSessions = Boolean(password) || Boolean(role)
    if (password) update.password = await bcrypt.hash(password, 10)
    const data = await UserModel.findOneAndUpdate(
      { _id: id },
      {
        $set: update,
        ...(clearSchedule ? { $unset: { schedule: '' } } : {}),
        ...(revokeSessions ? { $inc: { tokenVersion: 1 } } : {})
      },
      { returnDocument: 'after', runValidators: true }
    )
      .select('-password -tokenVersion')
      .populate('role', 'name')
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    sendUserError(res, error, 'Error al actualizar el usuario')
  }
}

const logoutUser = async (req, res) => {
  try {
    await UserModel.updateOne(
      { _id: req.userId },
      { $inc: { tokenVersion: 1 } }
    )
    res.status(200).json({ message: 'Sesión cerrada' })
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cerrar sesión' })
  }
}

const revokeUserSessions = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const target = await UserModel.findById(id).populate('role', 'name')
    if (!target)
      return res.status(404).json({ message: 'Usuario no encontrado' })
    if (isSudo(target.role?.name)) {
      return res.status(403).json({
        message: 'No se pueden cerrar las sesiones de sudo'
      })
    }
    await UserModel.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } })
    res.status(200).json({ message: 'Sesiones cerradas' })
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cerrar las sesiones' })
  }
}

const deleteUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const existing = await UserModel.findById(id)
      .select('role')
      .populate('role', 'name')
    if (!existing || sudoIsHidden(req.role, existing))
      return res.status(404).json({ message: 'Usuario no encontrado' })
    guardAssignable(req.role, undefined, existing)
    const data = await UserModel.deleteOne({ _id: id })
    if (data.deletedCount === 0)
      return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json({ message: 'Usuario eliminado exitosamente' })
  } catch (error) {
    sendUserError(res, error, 'Error al eliminar el usuario')
  }
}

export {
  getUser,
  getUsers,
  getAssignableUsers,
  getCurrentUser,
  loginUser,
  registerUser,
  updateUser,
  deleteUser,
  logoutUser,
  revokeUserSessions
}
