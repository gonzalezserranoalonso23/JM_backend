/**
 * Movimientos de inventario (entradas/salidas/ventas) que ajustan el stock del
 * producto según stockDirection del tipo de inventario.
 * Base: /api/inventory-records (requiere token)
 *
 * GET    /                       -> getInventoryRecords      query: page, limit, search (producto o fecha), type, direction (1 entradas | -1 salidas), paymentType
 * GET    /liveInformation       -> getLiveInformation       query: date (YYYY-MM-DD, la manda el frontend)
 * GET    /reports/daily-summary  -> getDailySalesSummary     query: date (YYYY-MM-DD)
 * GET    /reports/low-stock      -> getLowStockProducts      query: page, limit, search, category
 * GET    /reports/date-range     -> getSalesByDateRange      query: startDate, endDate, page, limit, paymentType, type (_id)
 *                                                          respuesta: summary y byType indexados por _id del tipo
 * GET    /reports/by-type        -> getInventoryByType       query: type
 * GET    /reports/stats          -> getInventoryStats        sin parámetros
 * GET    /:id                    -> getInventoryRecord       params: id
 * POST   /                       -> createInventoryRecord    body: { date, typeInventory, productName, category, paymentType, quantity, productPrice, totalAmount }
 * POST   /bulk                   -> createInventoryRecords   body: [registros] | { records: [registros] }
 * PUT    /:id                    -> updateInventoryRecord    params: id | body: campos del registro (reajusta stock)
 * DELETE /:id                    -> deleteInventoryRecord    params: id (solo admin; revierte stock, 409 si no es posible)
 */
import InventoryRecord from './inventory-records.model.js'
import Product from '../products/products.model.js'
import TypeInventory from '../type-inventory/type-inventory.model.js'
import PaymentType from '../payment-types/payment-types.model.js'
import { isValidObjectId } from 'mongoose'
import {
  CATEGORY_FIELDS,
  PAYMENT_TYPE_FIELDS,
  PRODUCT_NAME_FIELDS,
  SUPPLIER_FIELDS,
  TYPE_INVENTORY_FIELDS
} from '../../utils/projections.js'
import { lineTotal, roundMoney } from '../../utils/money.js'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../../utils/pagination.js'

const getInventoryType = async (id) => {
  if (!isValidObjectId(id)) {
    const error = new Error('ID de tipo de inventario inválido')
    error.status = 400
    throw error
  }

  const type = await TypeInventory.findById(id)
  if (!type) {
    const error = new Error('Tipo de inventario no encontrado')
    error.status = 404
    throw error
  }
  return type
}

const getPaymentType = async (id) => {
  if (id === undefined || id === null || id === '') return null
  if (!isValidObjectId(id)) {
    const error = new Error('ID de tipo de pago inválido')
    error.status = 400
    throw error
  }

  const paymentType = await PaymentType.findById(id)
  if (!paymentType) {
    const error = new Error('Tipo de pago no encontrado')
    error.status = 404
    throw error
  }
  return paymentType
}

const isIssueType = (type) => Number(type?.stockDirection) === -1

const stockDelta = (type, quantity) =>
  Number(type.stockDirection) * Number(quantity)

// Ajuste atómico ($inc): evita carreras entre peticiones simultáneas. Al restar
// exige stock suficiente, salvo con `force` (reversas internas).
const adjustStock = (productId, delta, { force = false } = {}) => {
  const filter = { _id: productId }
  if (delta < 0 && !force) filter.productStock = { $gte: -delta }
  return Product.findOneAndUpdate(
    filter,
    // $inc acumulaba error de punto flotante (0.1 + 0.2); se redondea a 3 decimales
    [
      {
        $set: {
          productStock: { $round: [{ $add: ['$productStock', delta] }, 3] }
        }
      }
    ],
    { returnDocument: 'after', updatePipeline: true }
  )
}

const insufficientStockError = (availableStock, requestedQuantity) => {
  const error = new Error('Stock insuficiente')
  error.status = 400
  error.availableStock = availableStock
  error.requestedQuantity = requestedQuantity
  return error
}

// Deshace un movimiento ya creado (stock y registro)
const rollbackRecord = async (record) => {
  const productId = record.productName?._id ?? record.productName
  await adjustStock(
    productId,
    -stockDelta(record.typeInventory, record.quantity),
    {
      force: true
    }
  )
  await InventoryRecord.deleteOne({ _id: record._id })
}

const getInventoryRecords = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  const filter = {}
  if (req.query?.type) {
    if (!isValidObjectId(req.query.type)) {
      return res
        .status(400)
        .json({ message: 'ID de tipo de inventario inválido' })
    }
    filter.typeInventory = req.query.type
  }

  if (req.query?.paymentType) {
    if (!isValidObjectId(req.query.paymentType)) {
      return res.status(400).json({ message: 'ID de tipo de pago inválido' })
    }
    filter.paymentType = req.query.paymentType
  }

  const direction = req.query?.direction
  if (direction !== undefined && !['1', '-1'].includes(String(direction))) {
    return res.status(400).json({ message: 'direction debe ser 1 o -1' })
  }

  try {
    if (direction !== undefined) {
      const types = await TypeInventory.find(
        { stockDirection: Number(direction) },
        { _id: 1 }
      ).lean()
      const typeIds = types.map((item) => item._id)
      filter.typeInventory = filter.typeInventory
        ? { $in: typeIds.filter((id) => String(id) === filter.typeInventory) }
        : { $in: typeIds }
    }

    const search = req.query?.search?.trim()
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' }
      const products = await Product.find(
        { productName: regex },
        { _id: 1 }
      ).lean()
      filter.$or = [
        { productName: { $in: products.map((item) => item._id) } },
        ...buildDateConditions(search)
      ]
    }

    const query = InventoryRecord.find(filter)
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .populate('category', CATEGORY_FIELDS)
      .select('-User')
      .sort({ date: -1, _id: -1 })

    if (!pagination.requested) {
      return res.status(200).json(await query)
    }

    const [data, total] = await Promise.all([
      query.skip(pagination.skip).limit(pagination.limit),
      InventoryRecord.countDocuments(filter)
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    return res.status(500).json({
      message: 'Hubo un error al cargar los registros de inventario!',
      error: error.message
    })
  }
}

// `date` se guarda como YYYY-MM-DD. Además del texto tal cual, acepta DD/MM/AAAA, DD/MM y MM/AAAA.
const buildDateConditions = (search) => {
  const conditions = [{ date: { $regex: escapeRegex(search), $options: 'i' } }]
  if (!/^\d{1,4}([/.-]\d{1,4}){1,2}$/.test(search)) return conditions

  const parts = search.split(/[/.-]/)
  const pad = (value) => value.padStart(2, '0')
  const [a, b, c] = parts

  if (parts.length === 3 && c.length === 4 && a.length <= 2 && b.length <= 2) {
    conditions.push({ date: `${c}-${pad(b)}-${pad(a)}` })
  } else if (parts.length === 2 && a.length <= 2 && b.length <= 2) {
    conditions.push({ date: { $regex: `-${pad(b)}-${pad(a)}$` } })
  } else if (parts.length === 2 && a.length <= 2 && b.length === 4) {
    conditions.push({ date: { $regex: `^${b}-${pad(a)}-` } })
  }
  return conditions
}

const getInventoryRecord = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  InventoryRecord.findById(id)
    .populate('typeInventory', TYPE_INVENTORY_FIELDS)
    .populate('paymentType', PAYMENT_TYPE_FIELDS)
    .populate('category', CATEGORY_FIELDS)
    .populate('productName', PRODUCT_NAME_FIELDS)
    .select('-User')
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Registro de inventario no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message: 'Hubo un error el registro de inventario!',
        error
      })
    )
}
// Crea un único movimiento de inventario y actualiza el stock del producto.
// Lanza un error con `.status` para que el caller (single o bulk) responda igual.
const CLIENT_DATE = /^\d{4}-\d{2}-\d{2}$/

const createSingleInventoryRecord = async (payload, authenticatedUserId) => {
  const { typeInventory, productName } = payload
  const clientDate = String(payload.date || '').trim()
  if (!CLIENT_DATE.test(clientDate)) {
    const error = new Error('La fecha es requerida con formato YYYY-MM-DD')
    error.status = 400
    throw error
  }

  const [inventoryType, paymentType] = await Promise.all([
    getInventoryType(typeInventory),
    getPaymentType(payload.paymentType)
  ])

  const quantity = Number(payload.quantity)

  if (!isValidObjectId(productName)) {
    const error = new Error('ID de producto inválido')
    error.status = 400
    throw error
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Cantidad inválida')
    error.status = 400
    throw error
  }

  const product = await Product.findById(productName)
  if (!product) {
    const error = new Error('Producto no encontrado')
    error.status = 404
    throw error
  }

  const isExit = isIssueType(inventoryType)
  const categoryId = product.category?._id || product.category
  const unitPrice = Number(isExit ? product.productPrice : product.purchasePrice)
  const totalAmount = lineTotal(quantity, unitPrice)

  if (!categoryId || !isValidObjectId(categoryId)) {
    const error = new Error('El producto no tiene una categoría válida')
    error.status = 400
    throw error
  }

  if (!Number.isFinite(unitPrice) || totalAmount === null) {
    const error = new Error('El producto no tiene un precio válido')
    error.status = 400
    throw error
  }

  if (isExit && product.productStock < quantity) {
    throw insufficientStockError(product.productStock, quantity)
  }

  if (!authenticatedUserId) {
    const error = new Error('Usuario no autenticado')
    error.status = 401
    throw error
  }

  const stockChange = stockDelta(inventoryType, quantity)
  const updatedProduct = await adjustStock(productName, stockChange)
  if (!updatedProduct) {
    throw insufficientStockError(product.productStock, quantity)
  }

  let savedRecord
  try {
    savedRecord = await new InventoryRecord({
      date: clientDate,
      typeInventory: inventoryType._id,
      productName,
      category: categoryId,
      productPrice: String(unitPrice),
      quantity,
      totalAmount,
      paymentType: paymentType?._id ?? null,
      User: authenticatedUserId
    }).save()
  } catch (error) {
    await adjustStock(productName, -stockChange, { force: true })
    throw error
  }

  return InventoryRecord.findById(savedRecord._id)
    .populate('typeInventory', TYPE_INVENTORY_FIELDS)
    .populate('paymentType', PAYMENT_TYPE_FIELDS)
    .populate('productName', PRODUCT_NAME_FIELDS)
    .populate('category', CATEGORY_FIELDS)
    .select('-User')
}

// Normaliza errores de Mongoose (ValidationError/CastError) a un 400 con
// mensaje legible, en vez de un 500 genérico que oculta la causa real.
const toHttpError = (error) => {
  if (error.status) return error

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    const httpError = new Error(
      Object.values(error.errors || {})
        .map((e) => e.message)
        .join(', ') || error.message
    )
    httpError.status = 400
    return httpError
  }

  return error
}

const createInventoryRecord = async (req, res) => {
  try {
    const authenticatedUserId = req.user?.id || req.userId
    const populatedRecord = await createSingleInventoryRecord(
      req.body,
      authenticatedUserId
    )

    res.status(201).json(populatedRecord)
  } catch (rawError) {
    const error = toHttpError(rawError)
    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : 'Ha ocurrido un error al crear el registro de inventario',
      availableStock: error.availableStock,
      requestedQuantity: error.requestedQuantity,
      error: error.status ? undefined : error.message
    })
  }
}

// Recibe un carrito de movimientos (arreglo) y los crea uno por uno, en orden,
// para que el stock de cada iteración quede reflejado en la siguiente.
// Todo o nada: si un renglón falla, se deshacen los ya creados.
const createInventoryRecords = async (req, res) => {
  const records = Array.isArray(req.body) ? req.body : req.body.records

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      message: 'Se requiere un arreglo "records" con al menos un movimiento'
    })
  }

  const authenticatedUserId = req.user?.id || req.userId
  const created = []

  try {
    for (const payload of records) {
      const populatedRecord = await createSingleInventoryRecord(
        payload,
        authenticatedUserId
      )
      created.push(populatedRecord)
    }

    res.status(201).json(created)
  } catch (rawError) {
    const error = toHttpError(rawError)
    const failedAt = created.length
    for (const record of created.reverse()) {
      await rollbackRecord(record).catch(() => {})
    }
    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : 'Ha ocurrido un error al crear el registro de inventario',
      availableStock: error.availableStock,
      requestedQuantity: error.requestedQuantity,
      error: error.status ? undefined : error.message,
      failedAt
    })
  }
}

const updateInventoryRecord = async (req, res) => {
  const { id } = req.params
  const {
    date,
    typeInventory,
    productName,
    category,
    productPrice,
    quantity,
    totalAmount,
    paymentType
  } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })

  try {
    const previous = await InventoryRecord.findById(id)
    if (!previous)
      return res
        .status(404)
        .json({ message: 'Registro de inventario no encontrado' })

    const nextTypeId = typeInventory ?? previous.typeInventory
    const nextPaymentId =
      paymentType === undefined ? previous.paymentType : paymentType
    const [previousType, nextType, nextPayment] = await Promise.all([
      getInventoryType(previous.typeInventory),
      getInventoryType(nextTypeId),
      getPaymentType(nextPaymentId)
    ])
    const next = {
      date: date ?? previous.date,
      typeInventory: nextType,
      productName: productName ?? previous.productName,
      quantity: Number(quantity ?? previous.quantity),
      totalAmount: Number(totalAmount ?? previous.totalAmount)
    }
    if (quantity !== undefined || productPrice !== undefined) {
      next.totalAmount =
        lineTotal(next.quantity, productPrice ?? previous.productPrice) ??
        next.totalAmount
    }
    if (!Number.isFinite(next.quantity) || next.quantity <= 0)
      return res.status(400).json({ message: 'Cantidad inválida' })

    const previousDelta = stockDelta(previousType, previous.quantity)
    const nextDelta = stockDelta(next.typeInventory, next.quantity)
    const sameProduct =
      String(previous.productName) === String(next.productName)

    // Deja el stock como si el movimiento viejo nunca hubiera existido y aplica el nuevo
    if (sameProduct) {
      if (nextDelta !== previousDelta) {
        const adjusted = await adjustStock(
          next.productName,
          nextDelta - previousDelta
        )
        if (!adjusted) throw insufficientStockError(undefined, next.quantity)
      }
    } else {
      const reverted = await adjustStock(previous.productName, -previousDelta)
      if (!reverted) throw insufficientStockError(undefined, previous.quantity)
      const applied = await adjustStock(next.productName, nextDelta)
      if (!applied) {
        await adjustStock(previous.productName, previousDelta, { force: true })
        throw insufficientStockError(undefined, next.quantity)
      }
    }

    const data = await InventoryRecord.findOneAndUpdate(
      { _id: id },
      {
        date,
        typeInventory: nextType._id,
        productName: next.productName,
        category: category ?? previous.category,
        productPrice: productPrice ?? previous.productPrice,
        quantity: next.quantity,
        totalAmount: next.totalAmount,
        paymentType: nextPayment?._id ?? null
      },
      { returnDocument: 'after' }
    )
    res.status(200).json(data)
  } catch (rawError) {
    const error = toHttpError(rawError)
    if (error.status) {
      return res.status(error.status).json({
        message: error.message,
        availableStock: error.availableStock,
        requestedQuantity: error.requestedQuantity
      })
    }
    res.status(500).json({
      message:
        'Ha ocurrido un error al actualizar el registro de inventario !  ',
      error
    })
  }
}

// Borrar un movimiento revierte su efecto en el stock
const deleteInventoryRecord = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })

  try {
    const record = await InventoryRecord.findById(id)
    if (!record)
      return res
        .status(404)
        .json({ message: 'Registro de inventario no encontrado' })

    const inventoryType = await getInventoryType(record.typeInventory)
    const reverted = await adjustStock(
      record.productName,
      -stockDelta(inventoryType, record.quantity)
    )
    if (!reverted && (await Product.findById(record.productName))) {
      return res.status(409).json({
        message:
          'No se puede borrar: el stock de esta entrada ya fue utilizado en salidas'
      })
    }

    await InventoryRecord.deleteOne({ _id: id })
    res.status(200).json({
      message: 'El registro de inventario se ha borrado exitosamente!'
    })
  } catch (error) {
    res.status(500).json({
      message: 'Hubo un error al intentar borrar el registro de inventario  ',
      error
    })
  }
}

// REPORTES Y ANÁLISIS

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/

const paymentBucket = (name) => {
  const label = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (label.includes('efectivo')) return 'cash'
  if (label.includes('tarjeta')) return 'card'
  return ''
}

// Suma las salidas del día. La fecha llega del frontend; no se usa la del servidor.
const getLiveInformation = async (req, res) => {
  const date = String(req.query.date || '').trim()
  if (!DATE_PARAM.test(date)) {
    return res
      .status(400)
      .json({ message: 'La fecha es requerida con formato YYYY-MM-DD' })
  }

  try {
    const issueTypes = await TypeInventory.find({ stockDirection: -1 })
      .select('_id')
      .lean()
    const issueIds = issueTypes.map((type) => type._id)

    const grouped = issueIds.length
      ? await InventoryRecord.aggregate([
          { $match: { date, typeInventory: { $in: issueIds } } },
          { $group: { _id: '$paymentType', total: { $sum: '$totalAmount' } } }
        ])
      : []

    const paymentIds = grouped.map((row) => row._id).filter(Boolean)
    const payments = paymentIds.length
      ? await PaymentType.find({ _id: { $in: paymentIds } })
          .select('paymentType')
          .lean()
      : []
    const names = new Map(
      payments.map((payment) => [String(payment._id), payment.paymentType])
    )

    let cashSales = 0
    let cardSales = 0
    for (const row of grouped) {
      const amount = Number(row.total) || 0
      const bucket = paymentBucket(names.get(String(row._id)))
      if (bucket === 'cash') cashSales += amount
      if (bucket === 'card') cardSales += amount
    }

    cashSales = roundMoney(cashSales)
    cardSales = roundMoney(cardSales)

    return res.status(200).json({
      date,
      cashSales,
      cardSales,
      totalSales: roundMoney(cashSales + cardSales)
    })
  } catch (error) {
    return res.status(500).json({
      message: 'Error al obtener las ventas del día',
      error: error.message
    })
  }
}

const getDailySalesSummary = async (req, res) => {
  const date = String(req.query.date || '').trim()
  if (!DATE_PARAM.test(date)) {
    return res
      .status(400)
      .json({ message: 'La fecha es requerida con formato YYYY-MM-DD' })
  }

  try {
    const query = { date }

    const records = await InventoryRecord.find(query)
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .lean()

    // Filtrar solo salidas (ventas)
    const exits = records.filter((r) => isIssueType(r.typeInventory))

    const totalSales = exits.reduce(
      (sum, r) => sum + parseFloat(r.totalAmount),
      0
    )
    const totalTransactions = exits.length
    const productsSold = exits.length

    res.status(200).json({
      date,
      totalSales,
      totalTransactions,
      productsSold,
      transactions: exits
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener resumen diario',
      error: error.message
    })
  }
}

const getLowStockProducts = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const filter = {
      isActive: { $ne: false },
      $expr: { $lt: ['$productStock', '$minimumProductStock'] }
    }
    const search =
      typeof req.query?.search === 'string' ? req.query.search.trim() : ''
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' }
      filter.$or = [{ productName: regex }, { productDescription: regex }]
    }
    const { category } = req.query
    if (category) {
      if (!isValidObjectId(category)) {
        return res.status(400).json({ message: 'Categoría inválida' })
      }
      filter.category = category
    }
    const query = Product.find(filter)
      .populate('category', CATEGORY_FIELDS)
      .populate('supplier', SUPPLIER_FIELDS)

    if (!pagination.requested) {
      const products = await query
      return res.status(200).json(products)
    }

    const [products, total] = await Promise.all([
      query
        .sort({ productName: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Product.countDocuments(filter)
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(products, total, pagination))
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener productos con stock bajo',
      error: error.message
    })
  }
}

const getSalesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: 'Proporcione fecha de inicio y fecha de fin' })
    }

    const pagination = getPagination(req.query)
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error })
    }

    const filter = {
      date: { $gte: startDate, $lte: endDate }
    }
    if (req.query.paymentType) {
      if (!isValidObjectId(req.query.paymentType)) {
        return res.status(400).json({ message: 'ID de tipo de pago inválido' })
      }
      filter.paymentType = req.query.paymentType
    }
    if (req.query.type) {
      if (!isValidObjectId(req.query.type)) {
        return res
          .status(400)
          .json({ message: 'ID de tipo de inventario inválido' })
      }
      filter.typeInventory = req.query.type
    }

    const query = InventoryRecord.find(filter)
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .select('-User')
      .sort({ date: -1 })
    const records = pagination.requested
      ? await query.skip(pagination.skip).limit(pagination.limit)
      : await query

    const byType = {}
    let totalRevenue = 0

    records.forEach((r) => {
      const typeId = String(r.typeInventory._id)
      if (!byType[typeId]) {
        byType[typeId] = { count: 0, totalAmount: 0, records: [] }
      }
      byType[typeId].count += 1
      byType[typeId].totalAmount += parseFloat(r.totalAmount)
      byType[typeId].records.push(r)

      if (isIssueType(r.typeInventory)) {
        totalRevenue += parseFloat(r.totalAmount)
      }
    })

    const response = {
      startDate,
      endDate,
      totalRevenue,
      totalRecords: records.length,
      byType,
      allRecords: records
    }
    if (pagination.requested) {
      const summaryFilter = {
        date: { $gte: startDate, $lte: endDate }
      }
      if (filter.paymentType) summaryFilter.paymentType = filter.paymentType
      const [total, summaryRecords] = await Promise.all([
        InventoryRecord.countDocuments(filter),
        InventoryRecord.find(summaryFilter).populate(
          'typeInventory',
          TYPE_INVENTORY_FIELDS
        )
      ])
      const summary = {}
      for (const record of summaryRecords) {
        const typeId = String(record.typeInventory._id)
        if (!summary[typeId]) {
          summary[typeId] = {
            count: 0,
            totalAmount: 0,
            products: new Set()
          }
        }
        summary[typeId].count += 1
        summary[typeId].totalAmount += Number(record.totalAmount)
        summary[typeId].products.add(String(record.productName))
      }
      for (const type of Object.values(summary)) {
        type.products = type.products.size
      }
      return res.status(200).json({
        ...createPaginatedResponse(records, total, pagination),
        ...response,
        summary
      })
    }
    return res.status(200).json(response)
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener ventas por rango de fecha',
      error: error.message
    })
  }
}

const getInventoryByType = async (req, res) => {
  try {
    const { type } = req.query

    if (!isValidObjectId(type)) {
      return res
        .status(400)
        .json({ message: 'ID de tipo de inventario inválido' })
    }

    const records = await InventoryRecord.find({
      typeInventory: type
    })
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .populate('category', CATEGORY_FIELDS)
      .select('-User')
      .sort({ date: -1 })

    res.status(200).json({
      type,
      count: records.length,
      records
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener inventario por tipo',
      error: error.message
    })
  }
}

const getInventoryStats = async (req, res) => {
  try {
    const [allProducts, allRecords] = await Promise.all([
      Product.find(
        { isActive: { $ne: false } },
        'productStock productPrice minimumProductStock'
      ).lean(),
      InventoryRecord.find({}, 'totalAmount typeInventory')
        .populate('typeInventory', 'stockDirection')
        .lean()
    ])

    const totalProducts = allProducts.length
    const totalValue = allProducts.reduce(
      (sum, p) => sum + p.productStock * p.productPrice,
      0
    )
    const lowStockCount = allProducts.filter(
      (p) => p.productStock < p.minimumProductStock
    ).length
    const zeroStockCount = allProducts.filter(
      (p) => p.productStock === 0
    ).length

    const exits = allRecords.filter((r) => isIssueType(r.typeInventory))
    const totalSalesValue = exits.reduce(
      (sum, r) => sum + parseFloat(r.totalAmount),
      0
    )

    res.status(200).json({
      totalProducts,
      totalInventoryValue: totalValue,
      lowStockProducts: lowStockCount,
      outOfStockProducts: zeroStockCount,
      totalSalesValue,
      totalMovements: allRecords.length
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener estadísticas de inventario',
      error: error.message
    })
  }
}

export {
  getInventoryRecord,
  getInventoryRecords,
  createInventoryRecord,
  createInventoryRecords,
  updateInventoryRecord,
  deleteInventoryRecord,
  getLiveInformation,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
}
