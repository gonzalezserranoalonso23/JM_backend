/**
 * Tipos de pago (efectivo, tarjeta, etc.). Base: /api/payment-types (requiere token)
 *
 * GET    /     -> getPaymentTypes   ordenados por paymentType
 * GET    /:id  -> getPaymentType    params: id
 * POST   /     -> createPaymentType body: campos del modelo (solo admin)
 * PUT    /:id  -> updatePaymentType params: id | body: campos del modelo (solo admin)
 * DELETE /:id  -> deletePaymentType params: id (solo admin; 409 si hay registros que lo usan)
 */
import { isValidObjectId } from 'mongoose'
import PaymentType from './payment-types.model.js'
import InventoryRecord from '../inventory-records/inventory-records.model.js'

const getPaymentTypes = async (req, res) => {
  try {
    res.status(200).json(await PaymentType.find().sort({ paymentType: 1 }))
  } catch (error) {
    res.status(500).json({
      message: 'Hubo un error al cargar los tipos de pago',
      error: error.message
    })
  }
}

const getPaymentType = async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  try {
    const paymentType = await PaymentType.findById(req.params.id)
    if (!paymentType) {
      return res.status(404).json({ message: 'Tipo de pago no encontrado' })
    }
    return res.status(200).json(paymentType)
  } catch (error) {
    return res.status(500).json({
      message: 'Hubo un error al cargar el tipo de pago',
      error: error.message
    })
  }
}

const createPaymentType = async (req, res) => {
  try {
    const paymentType = await new PaymentType(req.body).save()
    return res.status(201).json(paymentType)
  } catch (error) {
    return res.status(400).json({
      message: 'No se pudo crear el tipo de pago',
      error: error.message
    })
  }
}

const updatePaymentType = async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  try {
    const paymentType = await PaymentType.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    if (!paymentType) {
      return res.status(404).json({ message: 'Tipo de pago no encontrado' })
    }
    return res.status(200).json(paymentType)
  } catch (error) {
    return res.status(400).json({
      message: 'No se pudo actualizar el tipo de pago',
      error: error.message
    })
  }
}

const deletePaymentType = async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  try {
    const inUse = await InventoryRecord.exists({ paymentType: req.params.id })
    if (inUse) {
      return res.status(409).json({
        message:
          'No se puede eliminar: hay registros de inventario con este método de pago'
      })
    }
    const result = await PaymentType.deleteOne({ _id: req.params.id })
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Tipo de pago no encontrado' })
    }
    return res.status(200).json({ message: 'Tipo de pago eliminado' })
  } catch (error) {
    return res.status(500).json({
      message: 'No se pudo eliminar el tipo de pago',
      error: error.message
    })
  }
}

export {
  getPaymentTypes,
  getPaymentType,
  createPaymentType,
  updatePaymentType,
  deletePaymentType
}
