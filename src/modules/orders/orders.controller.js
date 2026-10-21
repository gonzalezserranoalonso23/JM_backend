/**
 * Pedidos a proveedores. Base: /api/orders (requiere token)
 *
 * GET    /     -> getOrders
 * GET    /:id  -> getOrder     params: id
 * POST   /     -> createOrder  body: { supplier, items* (no vacío), date, totalAmount, status = 'pendiente' }
 * PUT    /:id  -> updateOrder  params: id | body: { date, supplier, items, totalAmount, status }
 * DELETE /:id  -> deleteOrder  params: id (solo admin)
 */
import { SUPPLIER_FIELDS } from '../../utils/projections.js'
import { lineTotal, roundMoney } from '../../utils/money.js'
import Order from './orders.model.js'
import { isValidObjectId } from 'mongoose'

// Subtotal por línea y total de la orden calculados en el servidor
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

// Obtener todas las órdenes
const getOrders = (req, res) => {
  Order.find()
    .populate('supplier items.supplier', SUPPLIER_FIELDS)
    // Pendientes primero ('pendiente' > 'confirmado') y luego la fecha más reciente
    .sort({ status: -1, date: -1 })
    .lean()
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(500).json({
        message: 'Error al cargar órdenes',
        error
      })
    )
}

// Obtener una orden por ID
const getOrder = (req, res) => {
  const { id } = req.params

  if (!isValidObjectId(id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  Order.findById(id)
    .populate('supplier items.supplier', SUPPLIER_FIELDS)
    .then((data) => {
      if (!data) {
        return res.status(404).json({ message: 'Orden no encontrada' })
      }
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Error al cargar la orden',
        error
      })
    )
}

// Crear nueva orden
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
    status: status || 'pendiente'
  })

  newOrder
    .save()
    .then((data) => {
      return Order.findById(data._id).populate(
        'supplier items.supplier',
        SUPPLIER_FIELDS
      )
    })
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(500).json({
        message: 'Error al crear la orden',
        error
      })
    )
}

// Actualizar orden
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
    .populate('supplier items.supplier', SUPPLIER_FIELDS)
    .then((data) => {
      if (!data) {
        return res.status(404).json({ message: 'Orden no encontrada' })
      }
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Error al actualizar la orden',
        error
      })
    )
}

// Eliminar orden
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
    .catch((error) =>
      res.status(500).json({
        message: 'Error al eliminar la orden',
        error
      })
    )
}

export { getOrders, getOrder, createOrder, updateOrder, deleteOrder }
