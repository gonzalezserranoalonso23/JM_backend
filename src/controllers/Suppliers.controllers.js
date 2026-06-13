import SuppliersModel from '../models/ Suppliers.models.js'
import { isValidObjectId } from 'mongoose'

const getSuppliers = (req, res) => {
  SuppliersModel.find()
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar el proveedor!',
        error
      })
    )
}

const getSupplier = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })
  SuppliersModel.findById(id)
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar el proveedor!',
        error
      })
    )
}
const createSupplier = (req, res) => {
  const {
    suppliersName,
    supplierPhone,
    supplierContact,
    raiseOrder,
    deliverOrder
  } = req.body
  const newSupplier = new SuppliersModel({
    suppliersName,
    supplierPhone,
    supplierContact,
    raiseOrder,
    deliverOrder
  })
  newSupplier
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al crear el proveedor',
        error
      })
    )
}

const updateSupplier = (req, res) => {
  const { id } = req.params
  const {
    suppliersName,
    supplierPhone,
    supplierContact,
    raiseOrder,
    deliverOrder
  } = req.body
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  SuppliersModel.findOneAndUpdate(
    { _id: id },
    {
      suppliersName,
      supplierPhone,
      supplierContact,
      raiseOrder,
      deliverOrder
    },
    { new: true }
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al actualizar el proveedor',
        error
      })
    )
}

const deleteSupplier = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })

  SuppliersModel.deleteOne({ _id: id })
    .then(() =>
      res
        .status(201)
        .json({ message: 'El proveedor se ha borrado exitosamente!' })
    )
    .catch((error) =>
      res.status(505).json({
        message: 'Hubo un error al intentar borrar el proveedor ',
        error
      })
    )
}

export {
  getSupplier,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
}
