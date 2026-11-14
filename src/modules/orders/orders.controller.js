import { SUPPLIER_FIELDS } from '../../utils/projections.js'
import { lineTotal, roundMoney } from '../../utils/money.js'
import Order, { ORDER_STATUS } from './orders.model.js'
import Supplier from '../suppliers/suppliers.model.js'
import { isValidObjectId } from 'mongoose'
import {
  accentInsensitiveRegex,
  createPaginatedResponse,
  getPagination
} from '../../utils/pagination.js'

const SUPPLIER_PATH = 'supplier items.supplier'

const withTotals = (items) => {
  const priced = items.map((item) => {
    const subtotal = lineTotal(item.quantity, item.price)
    return subtotal === null ? item : { ...item, subtotal }
  })
  const totalAmount = roundMoney(
    priced.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)
  )
  return { items: priced, totalAmount }
}

const pendingFirst = (left, right) => {
  const rank = (status) => (status === ORDER_STATUS.pending ? 0 : 1)
  const byStatus = rank(left.status) - rank(right.status)
  if (byStatus !== 0) return byStatus
  return String(right.date || '').localeCompare(String(left.date || ''))
}

const orderFilter = async (search) => {
  const term = String(search || '').trim()
  if (!term) return {}
  const pattern = accentInsensitiveRegex(term)
  const suppliers = await Supplier.find({
    $or: [
      { suppliersName: { $regex: pattern, $options: 'i' } },
      { name: { $regex: pattern, $options: 'i' } }
    ]
  })
    .select('_id')
    .lean()
  return {
    $or: [
      { date: { $regex: pattern, $options: 'i' } },
      { supplier: { $in: suppliers.map((row) => row._id) } }
    ]
  }
}

const listOrders = (filter) =>
  Order.find(filter)
    .populate(SUPPLIER_PATH, SUPPLIER_FIELDS)
    .sort({ status: -1, date: -1 })

const getOrders = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const filter = await orderFilter(req.query?.search)
    if (!pagination.requested) {
      const data = await listOrders(filter).lean()
      return res.status(200).json(data.sort(pendingFirst))
    }

    const [data, total] = await Promise.all([
      listOrders(filter)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      Order.countDocuments(filter)
    ])
    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: 'Error al cargar órdenes',
    })
  }
}

const getOrder = (req, res) => {
  const { id } = req.params

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  Order.findById(id)
    .populate(SUPPLIER_PATH, SUPPLIER_FIELDS)
    .then((data) => {
      if (!data) {
        return res.status(404).json({ message: 'Orden no encontrada' })
      }
      res.status(200).json(data)
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Error al cargar la orden',
      })
    })
}

const createOrder = (req, res) => {
  const { date, supplier, items, totalAmount, status } = req.body

  if (!items || items.length === 0) {
    return res.status(400).json({
      message: 'Proporciona items'
    })
  }

  const computed = withTotals(items)
  const newOrder = new Order({
    date,
    supplier,
    items: computed.items,
    totalAmount: computed.totalAmount,
    status: status || ORDER_STATUS.pending
  })

  newOrder
    .save()
    .then((data) => {
      return Order.findById(data._id).populate(SUPPLIER_PATH, SUPPLIER_FIELDS)
    })
    .then((data) => res.status(201).json(data))
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Error al crear la orden',
      })
    })
}

const updateOrder = (req, res) => {
  const { id } = req.params
  const { date, supplier, items, totalAmount, status } = req.body

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  const computed = Array.isArray(items) ? withTotals(items) : null
  const update = Object.fromEntries(
    Object.entries({
      date,
      supplier,
      items: computed?.items ?? items,
      totalAmount: computed?.totalAmount ?? totalAmount,
      status
    }).filter(
      ([, value]) => value !== undefined
    )
  )

  Order.findByIdAndUpdate(
    id,
    { $set: update },
    { returnDocument: 'after', runValidators: true }
  )
    .populate(SUPPLIER_PATH, SUPPLIER_FIELDS)
    .then((data) => {
      if (!data) {
        return res.status(404).json({ message: 'Orden no encontrada' })
      }
      res.status(200).json(data)
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Error al actualizar la orden',
      })
    })
}

const deleteOrder = (req, res) => {
  const { id } = req.params

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  Order.findByIdAndDelete(id)
    .then((data) => {
      if (!data) {
        return res.status(404).json({ message: 'Orden no encontrada' })
      }
      res.status(200).json({
        message: 'Orden eliminada exitosamente'
      })
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Error al eliminar la orden',
      })
    })
}

export { getOrders, getOrder, createOrder, updateOrder, deleteOrder }
