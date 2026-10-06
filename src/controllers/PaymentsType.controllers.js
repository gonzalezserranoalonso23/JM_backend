import PaymentType from '../models/PaymentsType.models.js'
import { isValidObjectId } from 'mongoose'

const getPaymentTypes = (req, res) => {
  PaymentType.find()
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error al cargar los tipos de pago!',
        error
      })
    )
}

const getPaymentType = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  PaymentType.findById(id)
    .then((data) => {
      if (!data)
        return res.status(404).json({ message: 'Tipo de pago no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error al cargar el tipo de pago!',
        error
      })
    )
}
const createPaymentType = (req, res) => {
  const { paymentType } = req.body

  const newPaymentType = new PaymentType({
    paymentType
  })
  newPaymentType
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(500).json({
        message: 'Ha ocurrido un error al crear el tipo de pago ',
        error
      })
    )
}

const updatePaymentType = (req, res) => {
  const { id } = req.params
  const { paymentType } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  PaymentType.findOneAndUpdate(
    { _id: id },
    {
      paymentType
    },
    { new: true }
  )
    .then((data) => {
      if (!data)
        return res.status(404).json({ message: 'Tipo de pago no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Ha ocurrido un error al actualizar el tipo de pago ',
        error
      })
    )
}

const deletePaymentType = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })

  PaymentType.deleteOne({ _id: id })
    .then((result) => {
      if (result.deletedCount === 0)
        return res.status(404).json({ message: 'Tipo de pago no encontrado' })
      res
        .status(200)
        .json({ message: 'El tipo de pago se ha borrado exitosamente!' })
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error al intentar borrar el tipo de pago',
        error
      })
    )
}

export {
  getPaymentType,
  getPaymentTypes,
  createPaymentType,
  updatePaymentType,
  deletePaymentType
}
