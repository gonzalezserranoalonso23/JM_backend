import DailyInformation from '../models/DailyInformation.models.js'

import { isValidObjectId } from 'mongoose'

const getDailyInformations = (req, res) => {
  DailyInformation.find()
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar las informaciones diarias!',
        error
      })
    )
}

const getDailyInformation = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })
  DailyInformation.findById(id)
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar la información diaria!',
        error
      })
    )
}

const createDailyInformation = (req, res) => {
  const { date, cashSales, cardSales, totalSales, totalTransactions } = req.body

  const newDailyInformation = new DailyInformation({
    date,
    cashSales,
    cardSales,
    totalSales,
    totalTransactions
  })
  newDailyInformation
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al crear la información diaria ',
        error
      })
    )
}

const updateDailyInformation = (req, res) => {
  const { id } = req.params
  const { date, cashSales, cardSales, totalSales, totalTransactions } = req.body
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  DailyInformation.findOneAndUpdate(
    { _id: id },
    {
      date,
      cashSales,
      cardSales,
      totalSales,
      totalTransactions
    },
    { new: true }
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al actualizar la información diaria',
        error
      })
    )
}

const deleteDailyInformation = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  DailyInformation.findOneAndDelete({ _id: id })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al eliminar la información diaria',
        error
      })
    )
}

export {
  getDailyInformation,
  getDailyInformations,
  createDailyInformation,
  updateDailyInformation,
  deleteDailyInformation
}
