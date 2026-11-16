/**
 * Users and auth. Base: /api/users
 */
import { isValidObjectId } from 'mongoose'
import UserModel from '../models/users.model.js'
import {
  asBoolean,
  authenticateUser,
  buildUsersFilter,
  guardAssignable,
  guardSudoRole,
  hashPassword,
  isSudo,
  keepsSchedule,
  listAssignableUsers,
  normalizeSchedule,
  readRole,
  sudoIsHidden,
  withRole
} from '../services/users.service.js'
import {
  createPaginatedResponse,
  getPagination
} from '../utils/pagination.js'

const sendUserError = (res, error, fallback) => {
  if (!error.status) console.error(error)
  res.status(error.status || 500).json({
    message: error.status ? error.message : fallback
  })
}

const getAssignableUsers = async (req, res) => {
  try {
    const users = await listAssignableUsers()
    res.status(200).json(users)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al obtener usuarios' })
  }
}

const getUsers = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const filter = await buildUsersFilter({
      actorRole: req.role,
      search: req.query?.search
    })
    const base = () =>
      withRole(UserModel.find(filter).select('-password -tokenVersion'))

    if (!pagination.requested) {
      const data = await base().sort({ username: 1 }).lean()
      return res.status(200).json(data)
    }

    const [data, total] = await Promise.all([
      base().sort({ username: 1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      UserModel.countDocuments(filter)
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar los usuarios' })
  }
}

const getCurrentUser = async (req, res) => {
  try {
    const data = await withRole(
      UserModel.findById(req.userId).select('-password -tokenVersion')
    ).lean()
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar el perfil' })
  }
}

const getUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await withRole(
      UserModel.findById(id).select('-password -tokenVersion')
    ).lean()
    if (!data || sudoIsHidden(req.role, data))
      return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar el usuario' })
  }
}

const loginUser = async (req, res) => {
  try {
    const result = await authenticateUser(req.body || {})
    res.status(200).json(result)
  } catch (error) {
    sendUserError(res, error, 'Error al iniciar sesión')
  }
}

const registerUser = async (req, res) => {
  const { username, password, fullName } = req.body
  if (!username || !password)
    return res
      .status(400)
      .json({ message: 'Usuario y contraseña son requeridos' })
  try {
    const existUser = await UserModel.findOne({ username }).select('_id').lean()
    if (existUser)
      return res.status(409).json({ message: 'El usuario ya existe' })

    const passCrypt = await hashPassword(password)
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
    const existing = await withRole(UserModel.findById(id).select('username role')).lean()
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
    if (password) update.password = await hashPassword(password)

    const data = await withRole(
      UserModel.findOneAndUpdate(
        { _id: id },
        {
          $set: update,
          ...(clearSchedule ? { $unset: { schedule: '' } } : {}),
          ...(revokeSessions ? { $inc: { tokenVersion: 1 } } : {})
        },
        { returnDocument: 'after', runValidators: true }
      ).select('-password -tokenVersion')
    ).lean()
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
    res.status(500).json({ message: 'Error al cerrar sesión' })
  }
}

const revokeUserSessions = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const target = await withRole(UserModel.findById(id).select('role')).lean()
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
    res.status(500).json({ message: 'Error al cerrar las sesiones' })
  }
}

const deleteUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const existing = await withRole(UserModel.findById(id).select('role')).lean()
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
