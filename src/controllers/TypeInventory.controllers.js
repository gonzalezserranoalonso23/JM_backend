import TypeInventory from '../models/TypeInventory.models.js'
import { isValidObjectId } from 'mongoose'

const getTypeInventories = (req, res) => {
  TypeInventory.find()
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar los tipos de inventario!',
        error
      })
    )
}

const getTypeInventory = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })
  TypeInventory.findById(id)
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar el tipo de inventario!',
        error
      })
    )
}
const createTypeInventory = (req, res) => {
  const { typeInventory } = req.body
  console.log(typeInventory)
  const newTypeInventory = new TypeInventory({
    typeInventory
  })
  newTypeInventory
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al crear el tipo de inventario ',
        error
      })
    )
}

const updateTypeInventory = (req, res) => {
  const { id } = req.params
  const { typeInventory } = req.body
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  TypeInventory.findOneAndUpdate(
    { _id: id },
    {
      typeInventory
    },
    { new: true }
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al actualizar el tipo de inventario',
        error
      })
    )
}

const deleteTypeInventory = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })

  TypeInventory.deleteOne({ _id: id })
    .then(() =>
      res
        .status(201)
        .json({ message: 'El tipo de inventario se ha borrado exitosamente!' })
    )
    .catch((error) =>
      res.status(505).json({
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
