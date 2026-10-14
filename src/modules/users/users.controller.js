/**
 * Usuarios y autenticación. Base: /api/users
 *
 * POST   /login       -> loginUser           body: { username, password } | público, limitado a 10 intentos/15 min
 * POST   /register    -> registerUser        body: { username, password, email, fullName, isAdmin } (solo admin)
 * GET    /assignable  -> getAssignableUsers  usuarios (username, fullName) para asignar tareas (token)
 * GET    /            -> getUsers            query opcional: page, limit, search (solo admin)
 * GET    /:id         -> getUser             params: id (solo admin)
 * PUT    /:id         -> updateUser          params: id | body: { username, password, email, fullName, isAdmin } (solo admin)
 * DELETE /:id         -> deleteUser          params: id (solo admin)
 * POST   /logout      -> logoutUser          cierra todas las sesiones del usuario (invalida sus tokens)
 * Nunca se devuelve el campo password.
 */
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import UserModel from './users.model.js'
import { isValidObjectId } from 'mongoose'
import dotenv from 'dotenv'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../../utils/pagination.js'
dotenv.config()

const TOKEN_TTL = process.env.TOKEN_TTL || '7d'

const getAssignableUsers = async (req, res) => {
  try {
    const users = await UserModel.find({}, 'username fullName')
      .sort({ username: 1 })
      .lean()
    res.status(200).json(users)
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener usuarios',
      error: error.message
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
    const filter = search
      ? {
          $or: ['username', 'fullName', 'email'].map((field) => ({
            [field]: { $regex: escapeRegex(search), $options: 'i' }
          }))
        }
      : {}
    const query = UserModel.find(filter).select('-password -tokenVersion')

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
    res
      .status(500)
      .json({ message: 'Error al cargar los usuarios', error: error.message })
  }
}

const getUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await UserModel.findById(id).select('-password -tokenVersion')
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar el usuario', error: error.message })
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
    const existUser = await UserModel.findOne({ username })
    if (!existUser)
      return res
        .status(401)
        .json({ message: 'Usuario y/o contraseña no válida' })

    const isValid = await bcrypt.compare(password, existUser.password)
    if (!isValid)
      return res
        .status(401)
        .json({ message: 'Usuario y/o contraseña no válida' })

    const token = jwt.sign(
      {
        id: existUser._id,
        username: existUser.username,
        isAdmin: existUser.isAdmin === true,
        tv: existUser.tokenVersion ?? 0
      },
      process.env.SECURITY_JM,
      { expiresIn: TOKEN_TTL, algorithm: 'HS256' }
    )
    res
      .status(200)
      .json({ token, username: existUser.username, isAdmin: existUser.isAdmin })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al iniciar sesión', error: error.message })
  }
}

const registerUser = async (req, res) => {
  const { username, password, email, fullName, isAdmin } = req.body
  if (!username || !password || !email)
    return res
      .status(400)
      .json({ message: 'Usuario, contraseña y email son requeridos' })
  try {
    const existUser = await UserModel.findOne({ username })
    if (existUser)
      return res.status(409).json({ message: 'El usuario ya existe' })

    const existEmail = await UserModel.findOne({ email })
    if (existEmail)
      return res.status(409).json({ message: 'El email ya está registrado' })

    const passCrypt = await bcrypt.hash(password, 10)
    const newUser = new UserModel({
      username,
      password: passCrypt,
      email,
      fullName,
      isAdmin: isAdmin === true
    })
    const saved = await newUser.save()
    res.status(201).json({ username: saved.username })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al registrar el usuario', error: error.message })
  }
}

const updateUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  const { username, password, email, fullName, isAdmin } = req.body
  try {
    // La contraseña es opcional al editar; solo se actualizan los campos enviados.
    const update = Object.fromEntries(
      Object.entries({
        username,
        email,
        fullName,
        isAdmin: isAdmin === undefined ? undefined : isAdmin === true
      }).filter(([, value]) => value !== undefined)
    )
    const revokeSessions = Boolean(password) || update.isAdmin !== undefined
    if (password) update.password = await bcrypt.hash(password, 10)
    const data = await UserModel.findOneAndUpdate(
      { _id: id },
      revokeSessions
        ? { $set: update, $inc: { tokenVersion: 1 } }
        : { $set: update },
      { new: true, runValidators: true }
    ).select('-password -tokenVersion')
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al actualizar el usuario', error: error.message })
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
    res
      .status(500)
      .json({ message: 'Error al cerrar sesión', error: error.message })
  }
}

const deleteUser = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await UserModel.deleteOne({ _id: id })
    if (data.deletedCount === 0)
      return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json({ message: 'Usuario eliminado exitosamente' })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al eliminar el usuario', error: error.message })
  }
}

export {
  getUser,
  getUsers,
  getAssignableUsers,
  loginUser,
  registerUser,
  updateUser,
  deleteUser,
  logoutUser
}
