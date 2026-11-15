/**
 * Staff roles. Base: /api/roles (token)
 *
 * GET    /     Every role. The user form reads this list.
 * GET    /:id  params { id }
 * POST   /     { name }. Full access. Built-in names stay fixed.
 * PUT    /:id  params { id }, { name }. Full access.
 * DELETE /:id  params { id }. Full access. 409 when a user still has it.
 *
 * User.role stores this _id.
 */
import { isValidObjectId } from 'mongoose'
import RoleModel, { ROLE_NAMES, roleRank } from './roles.model.js'
import UserModel from '../users/users.model.js'

const sortRoles = (roles) =>
  [...roles].sort((left, right) => roleRank(left.name) - roleRank(right.name))

const withLock = (role) => ({
  _id: role._id,
  name: role.name,
  locked: ROLE_NAMES.includes(role.name)
})

const readName = (value) => String(value || '').trim()

const duplicateRole = (error, res) => {
  if (error?.code !== 11000) return false
  res.status(409).json({ message: 'Ese rol ya existe' })
  return true
}

const getRoles = async (req, res) => {
  try {
    const data = await RoleModel.find().lean()
    res.status(200).json(sortRoles(data).map(withLock))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar los roles' })
  }
}

const getRole = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await RoleModel.findById(id).lean()
    if (!data) return res.status(404).json({ message: 'Rol no encontrado' })
    res.status(200).json(withLock(data))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar el rol' })
  }
}

const createRole = async (req, res) => {
  const name = readName(req.body?.name)
  if (!name) return res.status(400).json({ message: 'El nombre es requerido' })
  try {
    const data = await RoleModel.create({ name })
    res.status(201).json(withLock(data))
  } catch (error) {
    if (duplicateRole(error, res)) return
    console.error(error)
    res.status(500).json({ message: 'Error al crear el rol' })
  }
}

const updateRole = async (req, res) => {
  const { id } = req.params
  const name = readName(req.body?.name)
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  if (!name) return res.status(400).json({ message: 'El nombre es requerido' })
  try {
    const current = await RoleModel.findById(id).select('name')
    if (!current) return res.status(404).json({ message: 'Rol no encontrado' })
    if (ROLE_NAMES.includes(current.name)) {
      return res
        .status(403)
        .json({ message: 'Ese rol del sistema no se puede cambiar' })
    }
    const data = await RoleModel.findOneAndUpdate(
      { _id: id },
      { name },
      { returnDocument: 'after', runValidators: true }
    )
    res.status(200).json(withLock(data))
  } catch (error) {
    if (duplicateRole(error, res)) return
    console.error(error)
    res.status(500).json({ message: 'Error al actualizar el rol' })
  }
}

const deleteRole = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const current = await RoleModel.findById(id).select('name')
    if (!current) return res.status(404).json({ message: 'Rol no encontrado' })
    if (ROLE_NAMES.includes(current.name)) {
      return res
        .status(403)
        .json({ message: 'Ese rol del sistema no se puede borrar' })
    }
    const inUse = await UserModel.exists({ role: id })
    if (inUse) {
      return res
        .status(409)
        .json({ message: 'Hay usuarios con este rol' })
    }
    await RoleModel.deleteOne({ _id: id })
    res.status(200).json({ message: 'Rol eliminado' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al eliminar el rol' })
  }
}

export { getRoles, getRole, createRole, updateRole, deleteRole }
