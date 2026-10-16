/**
 * Tipos de movimiento de inventario. stockDirection: 1 suma stock, -1 resta.
 * Base: /api/type-inventory (requiere token)
 *
 * GET    /     -> getTypeInventories
 * GET    /:id  -> getTypeInventory     params: id
 * POST   /     -> createTypeInventory  body: { typeInventory, stockDirection }
 * PUT    /:id  -> updateTypeInventory  params: id | body: { typeInventory, stockDirection }
 * DELETE /:id  -> deleteTypeInventory  params: id (solo admin)
 */
import TypeInventory from './type-inventory.model.js'
import { isValidObjectId } from 'mongoose'

const getTypeInventories = (req, res) => {
  TypeInventory.find()
    .lean()
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error al cargar los tipos de inventario!',
        error
      })
    )
}

const getTypeInventory = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  TypeInventory.findById(id)
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Tipo de inventario no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error al cargar el tipo de inventario!',
        error
      })
    )
}
const createTypeInventory = (req, res) => {
  const { typeInventory, stockDirection } = req.body
  const newTypeInventory = new TypeInventory({
    typeInventory,
    stockDirection
  })
  newTypeInventory
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(500).json({
        message: 'Ha ocurrido un error al crear el tipo de inventario ',
        error
      })
    )
}

const updateTypeInventory = (req, res) => {
  const { id } = req.params
  const { typeInventory, stockDirection } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  TypeInventory.findOneAndUpdate(
    { _id: id },
    {
      typeInventory,
      stockDirection
    },
    { returnDocument: 'after', runValidators: true }
  )
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Tipo de inventario no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Ha ocurrido un error al actualizar el tipo de inventario',
        error
      })
    )
}

const deleteTypeInventory = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })

  TypeInventory.deleteOne({ _id: id })
    .then((result) => {
      if (result.deletedCount === 0)
        return res
          .status(404)
          .json({ message: 'Tipo de inventario no encontrado' })
      res
        .status(200)
        .json({ message: 'El tipo de inventario se ha borrado exitosamente!' })
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error al intentar borrar el tipo de inventario ',
        error
      })
    )
}

export {
  getTypeInventory,
  getTypeInventories,
  createTypeInventory,
  updateTypeInventory,
  deleteTypeInventory
}
