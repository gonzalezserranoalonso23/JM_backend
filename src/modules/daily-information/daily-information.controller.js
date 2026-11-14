/**
 * Daily sales summary. Base: /api/daily-information (token)
 *
 * GET    /     -> query { date } one day, or { page, limit, search } a page.
 *                 Without them, the full list.
 * GET    /:id  -> one row. params { id }
 * POST   /     -> { date, cashSales, cardSales, totalSales, totalTransactions }
 * PUT    /:id  -> params { id }, same body as POST
 * DELETE /:id  -> params { id }, full access only
 */
import DailyInformation from './daily-information.model.js'
import { isValidObjectId } from 'mongoose'
import {
  accentInsensitiveRegex,
  createPaginatedResponse,
  getPagination
} from '../../utils/pagination.js'

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

const dateKeys = (value) => {
  const iso = String(value || '').trim()
  const match = ISO_DAY.exec(iso)
  if (!match) return [iso]
  const [, year, month, day] = match
  return [
    iso,
    `${day}/${month}/${year}`,
    `${Number(day)}/${Number(month)}/${year}`
  ]
}

const getDailyInformations = async (req, res) => {
  const query = req.query || {}

  try {
    if (query.date) {
      const row = await DailyInformation.findOne({
        date: { $in: dateKeys(query.date) }
      }).lean()
      return res.status(200).json(row)
    }

    const pagination = getPagination(query)
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error })
    }

    const search = String(query.search || '').trim()
    const filter = search
      ? { date: { $regex: accentInsensitiveRegex(search), $options: 'i' } }
      : {}
    const listed = () => DailyInformation.find(filter).sort({ date: -1 })

    if (!pagination.requested) {
      const data = await listed().lean()
      return res.status(200).json(data)
    }

    const [data, total] = await Promise.all([
      listed().skip(pagination.skip).limit(pagination.limit).lean(),
      DailyInformation.countDocuments(filter)
    ])
    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: 'Hubo un error al cargar las informaciones diarias!',
    })
  }
}

const getDailyInformation = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  DailyInformation.findById(id)
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Información diaria no encontrada' })
      res.status(200).json(data)
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Hubo un error al cargar la información diaria!',
      })
    })
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
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Ha ocurrido un error al crear la información diaria ',
      })
    })
}

const updateDailyInformation = (req, res) => {
  const { id } = req.params
  const { date, cashSales, cardSales, totalSales, totalTransactions } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  DailyInformation.findOneAndUpdate(
    { _id: id },
    {
      date,
      cashSales,
      cardSales,
      totalSales,
      totalTransactions
    },
    { returnDocument: 'after' }
  )
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Información diaria no encontrada' })
      res.status(200).json(data)
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Ha ocurrido un error al actualizar la información diaria',
      })
    })
}

const deleteDailyInformation = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  DailyInformation.findOneAndDelete({ _id: id })
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Información diaria no encontrada' })
      res
        .status(200)
        .json({ message: 'Información diaria eliminada exitosamente' })
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Ha ocurrido un error al eliminar la información diaria',
      })
    })
}

export {
  getDailyInformation,
  getDailyInformations,
  createDailyInformation,
  updateDailyInformation,
  deleteDailyInformation
}
