/**
 * Staff roles. Base: /api/roles (token)
 *
 * GET    /     Manager, Supervisor, Staff, User
 * GET    /:id  params { id }
 *
 * User.role stores this _id. Roles are not created, edited, or deleted.
 */
import { isValidObjectId } from 'mongoose'
import RoleModel, { ROLE_NAMES } from './roles.model.js'

const ROLE_ORDER = Object.fromEntries(
  ROLE_NAMES.map((name, index) => [name, index])
)

const sortRoles = (roles) =>
  [...roles].sort(
    (left, right) =>
      (ROLE_ORDER[left.name] ?? ROLE_NAMES.length) -
      (ROLE_ORDER[right.name] ?? ROLE_NAMES.length)
  )

const getRoles = async (req, res) => {
  try {
    const data = await RoleModel.find().lean()
    res.status(200).json(sortRoles(data))
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cargar los roles' })
  }
}

const getRole = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await RoleModel.findById(id).lean()
    if (!data) return res.status(404).json({ message: 'Rol no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cargar el rol' })
  }
}

export { getRoles, getRole }
