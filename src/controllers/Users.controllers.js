import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import UserModel from '../models/Users.models.js'
import { isValidObjectId } from 'mongoose'
import dotenv from 'dotenv'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../utils/pagination.js'
dotenv.config()

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
    const query = UserModel.find(filter).select('-password')

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
    const data = await UserModel.findById(id).select('-password')
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar el usuario', error: error.message })
  }
}

const loginUser = async (req, res) => {
  const { username, password, remember } = req.body
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
        isAdmin: existUser.isAdmin === true
      },
      process.env.SECURITY_JM,
      { expiresIn: remember === true ? '7d' : '1d' }
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
    if (password) update.password = await bcrypt.hash(password, 10)
    const data = await UserModel.findOneAndUpdate(
      { _id: id },
      { $set: update },
      { new: true, runValidators: true }
    ).select('-password')
    if (!data) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al actualizar el usuario', error: error.message })
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

export { getUser, getUsers, loginUser, registerUser, updateUser, deleteUser }
