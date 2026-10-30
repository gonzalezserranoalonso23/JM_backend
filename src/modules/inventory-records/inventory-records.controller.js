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
  TYPE_INVENTORY_FIELDS
} from '../../utils/projections.js'
import { lineTotal } from '../../utils/money.js'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../../utils/pagination.js'
import { isIssueType } from './inventory-records.shared.js'
import {
  getLiveInformation,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
} from './inventory-records.reports.js'

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

const stockDelta = (type, quantity) =>
  Number(type.stockDirection) * Number(quantity)

const roundQty = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000

// Ajuste atómico: evita carreras entre peticiones simultáneas. Al restar exige
// que el stock ya redondeado a 3 decimales alcance, el mismo número que ve la
// pantalla. Comparar el double crudo rechazaba la última pieza (0.9996 se ve
// como 1 y no cumple stock >= 1).
const adjustStock = (productId, delta, { force = false } = {}) => {
  const roundedDelta = roundQty(delta)
  const filter = { _id: productId }
  if (roundedDelta < 0 && !force) {
    filter.$expr = {
      $gte: [{ $round: ['$productStock', 3] }, roundQty(-roundedDelta)]
    }
  }
  return Product.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          productStock: {
            $round: [
              { $add: [{ $round: ['$productStock', 3] }, roundedDelta] },
              3
            ]
          }
        }
      }
    ],
    { returnDocument: 'after', updatePipeline: true }
  )
}

const insufficientStockError = (
  availableStock,
  requestedQuantity,
  productName
) => {
  const available = availableStock == null ? null : roundQty(availableStock)
  const name = productName ? ` de ${productName}` : ''
  const stockText = available == null ? '' : `. Disponible: ${available}`
  const error = new Error(`Stock insuficiente${name}${stockText}`)
  error.status = 400
  error.availableStock = available ?? undefined
  error.requestedQuantity = requestedQuantity
  error.productName = productName
  return error
}

// Deshace un movimiento ya creado. Cada paso queda marcado para que un
// reintento no vuelva a sumar el stock si el borrado fue lo que falló.
const rollbackRecord = async (rollback) => {
  if (!rollback.stockReverted) {
    await adjustStock(rollback.productId, -rollback.stockChange, {
      force: true
    })
    rollback.stockReverted = true
  }
  if (rollback.recordId && !rollback.recordDeleted) {
    await InventoryRecord.deleteOne({ _id: rollback.recordId })
    rollback.recordDeleted = true
  }
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
// Valida un movimiento sin escribir. El stock de salidas se decide aparte,
// sumando el carrito, para no guardar renglones si uno no alcanza.
const CLIENT_DATE = /^\d{4}-\d{2}-\d{2}$/

const prepareInventoryRecord = async (payload, authenticatedUserId) => {
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

  const quantity = roundQty(payload.quantity)

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
  const unitPrice = Number(
    isExit ? product.productPrice : product.purchasePrice
  )
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

  if (!authenticatedUserId) {
    const error = new Error('Usuario no autenticado')
    error.status = 401
    throw error
  }

  if (isExit && roundQty(product.productStock) < quantity) {
    throw insufficientStockError(
      product.productStock,
      quantity,
      product.productName
    )
  }

  return {
    clientDate,
    inventoryType,
    paymentType,
    product,
    quantity,
    isExit,
    categoryId,
    unitPrice,
    totalAmount,
    authenticatedUserId
  }
}

// Suma las salidas del carrito. Si un producto no alcanza, no se escribe nada.
const assertExitStock = async (drafts) => {
  const demand = new Map()
  for (const draft of drafts) {
    if (!draft.isExit) continue
    const key = String(draft.product._id)
    const row = demand.get(key) || {
      productId: draft.product._id,
      name: draft.product.productName,
      qty: 0
    }
    row.qty = roundQty(row.qty + draft.quantity)
    demand.set(key, row)
  }

  for (const row of demand.values()) {
    const product = await Product.findById(row.productId).select(
      'productStock productName'
    )
    if (!product) {
      const error = new Error(`Producto no encontrado: ${row.name}`)
      error.status = 404
      throw error
    }
    if (roundQty(product.productStock) < row.qty) {
      throw insufficientStockError(
        product.productStock,
        row.qty,
        product.productName
      )
    }
  }
}

const populateRecord = (id) =>
  InventoryRecord.findById(id)
    .populate('typeInventory', TYPE_INVENTORY_FIELDS)
    .populate('paymentType', PAYMENT_TYPE_FIELDS)
    .populate('productName', PRODUCT_NAME_FIELDS)
    .populate('category', CATEGORY_FIELDS)
    .select('-User')

// Descuenta o suma el stock y guarda el registro. Si el guardado falla,
// revierte el stock de este renglón antes de propagar el error.
const persistInventoryRecord = async (draft) => {
  const stockChange = stockDelta(draft.inventoryType, draft.quantity)
  const updatedProduct = await adjustStock(draft.product._id, stockChange)
  if (!updatedProduct) {
    const current = await Product.findById(draft.product._id).select(
      'productStock productName'
    )
    throw insufficientStockError(
      current?.productStock,
      draft.quantity,
      current?.productName || draft.product.productName
    )
  }

  const rollback = {
    productId: draft.product._id,
    stockChange,
    recordId: null
  }

  try {
    const savedRecord = await new InventoryRecord({
      date: draft.clientDate,
      typeInventory: draft.inventoryType._id,
      productName: draft.product._id,
      category: draft.categoryId,
      productPrice: String(draft.unitPrice),
      purchasePrice: Number(draft.product.purchasePrice),
      quantity: draft.quantity,
      totalAmount: draft.totalAmount,
      paymentType: draft.paymentType?._id ?? null,
      User: draft.authenticatedUserId
    }).save()
    rollback.recordId = savedRecord._id
    const populated = await populateRecord(savedRecord._id)
    return { populated, rollback }
  } catch (error) {
    try {
      await rollbackRecord(rollback)
    } catch {
      await rollbackRecord(rollback)
    }
    throw error
  }
}

const createSingleInventoryRecord = async (payload, authenticatedUserId) => {
  const draft = await prepareInventoryRecord(payload, authenticatedUserId)
  const { populated } = await persistInventoryRecord(draft)
  return populated
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
      productName: error.productName,
      error: error.status ? undefined : error.message
    })
  }
}

const undoCreatedRecords = async (created) => {
  let failed = false
  for (const item of created.reverse()) {
    try {
      await rollbackRecord(item.rollback)
    } catch {
      try {
        await rollbackRecord(item.rollback)
      } catch {
        failed = true
      }
    }
  }
  return failed
}

// Recibe un carrito. Primero valida el stock de todas las salidas juntas.
// Si uno no alcanza, no se guarda ningún renglón. Si falla a medias por una
// carrera, se deshacen los ya creados.
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
    const drafts = []
    for (const payload of records) {
      drafts.push(
        await prepareInventoryRecord(payload, authenticatedUserId)
      )
    }
    await assertExitStock(drafts)

    for (const draft of drafts) {
      created.push(await persistInventoryRecord(draft))
    }

    res.status(201).json(created.map((item) => item.populated))
  } catch (rawError) {
    const error = toHttpError(rawError)
    const failedAt = created.length
    const rollbackFailed = await undoCreatedRecords(created)
    res.status(rollbackFailed ? 500 : error.status || 500).json({
      message: rollbackFailed
        ? 'El carrito no se completó y no se pudo deshacer. Revisa los movimientos antes de volver a registrarlo.'
        : error.status
          ? error.message
          : 'Ha ocurrido un error al crear el registro de inventario',
      availableStock: rollbackFailed ? undefined : error.availableStock,
      requestedQuantity: rollbackFailed ? undefined : error.requestedQuantity,
      productName: rollbackFailed ? undefined : error.productName,
      error: error.status && !rollbackFailed ? undefined : error.message,
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
