import SuppliersModel from '../models/ Suppliers.models.js'
import { isValidObjectId } from 'mongoose'

const getSuppliers = async (req, res) => {
  try {
    const data = await SuppliersModel.find()
    res.status(200).json(data)
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar los proveedores',
      error: error.message
    })
  }
}

const getSupplier = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await SuppliersModel.findById(id)
    if (!data)
      return res.status(404).json({ message: 'Proveedor no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar el proveedor', error: error.message })
  }
}

const createSupplier = async (req, res) => {
  const {
    suppliersName,
    supplierPhone,
    suppliersContact,
    raiseOrder,
    deliverOrder,
    isActive
  } = req.body
  if (!suppliersName)
    return res
      .status(400)
      .json({ message: 'El nombre del proveedor es requerido' })
  try {
    const newSupplier = new SuppliersModel({
      suppliersName,
      supplierPhone,
      suppliersContact,
      raiseOrder,
      deliverOrder,
      isActive
    })
    const data = await newSupplier.save()
    res.status(201).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al crear el proveedor', error: error.message })
  }
}

const updateSupplier = async (req, res) => {
  const { id } = req.params
  const {
    suppliersName,
    supplierPhone,
    suppliersContact,
    raiseOrder,
    deliverOrder,
    isActive
  } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await SuppliersModel.findOneAndUpdate(
      { _id: id },
      {
        suppliersName,
        supplierPhone,
        suppliersContact,
        raiseOrder,
        deliverOrder,
        isActive
      },
      { new: true }
    )
    if (!data)
      return res.status(404).json({ message: 'Proveedor no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res.status(500).json({
      message: 'Error al actualizar el proveedor',
      error: error.message
    })
  }
}

const deleteSupplier = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await SuppliersModel.deleteOne({ _id: id })
    if (data.deletedCount === 0)
      return res.status(404).json({ message: 'Proveedor no encontrado' })
    res.status(200).json({ message: 'Proveedor eliminado exitosamente' })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al eliminar el proveedor', error: error.message })
  }
}

export {
  getSupplier,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
}
