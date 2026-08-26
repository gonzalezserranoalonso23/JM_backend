import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import UserModel from '../models/Users.models.js'
import { isValidObjectId } from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const getUsers = async (req, res) => {
  try {
    const data = await UserModel.find().select('-password')
    res.status(200).json(data)
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
  const { username, password } = req.body
  if (!username || !password)
    return res
      .status(400)
      .json({ message: 'Usuario y contraseña son requeridos' })
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
      { id: existUser._id, username: existUser.username },
      process.env.SECURITY_JM,
      { expiresIn: '7d' }
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
      isAdmin
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
    const passCrypt = await bcrypt.hash(password, 10)
    const data = await UserModel.findOneAndUpdate(
      { _id: id },
      { username, password: passCrypt, email, fullName, isAdmin },
      { new: true }
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
