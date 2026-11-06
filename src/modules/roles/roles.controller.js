/**
 * Roles del personal. Base: /api/roles (requiere token)
 *
 * GET    /     -> getRoles     lista fija: Manager, Supervisor, Staff y User
 * GET    /:id  -> getRole      params: id
 *
 * El _id de este documento es la llave foránea en User.role.
 * No se crean, editan ni borran: esos nombres definen el acceso.
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
    res
      .status(500)
      .json({ message: 'Error al cargar los roles', error: error.message })
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
    res
      .status(500)
      .json({ message: 'Error al cargar el rol', error: error.message })
  }
}

export { getRoles, getRole }
