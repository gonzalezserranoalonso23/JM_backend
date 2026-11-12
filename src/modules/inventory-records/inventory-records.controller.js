/**
 * Inventory movements. stockDirection adds or subtracts product stock.
 * Base: /api/inventory-records (token)
 *
 * GET    /                      query { page, limit, search, type, direction, paymentType }
 * GET    /liveInformation       query { date }
 * GET    /reports/daily-summary query { date }
 * GET    /reports/low-stock     query { page, limit, search, category }
 * GET    /reports/date-range    query { startDate, endDate, page, limit, paymentType, type }
 * GET    /reports/by-type       query { type }
 * GET    /reports/stats
 * GET    /:id                   params { id }
 * POST   /                      { date, typeInventory, productName, category, paymentType, quantity, productPrice, totalAmount }
 * POST   /bulk                  [records] or { records }
 * PUT    /:id                   params { id }, same fields as POST. Adjusts stock.
 * DELETE /:id                   params { id }. Full access only. Reverses stock.
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

// Subtract only when rounded stock (3 decimals) still covers the quantity.
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

// Undo a saved movement. A retry must not add the stock twice.
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

// Stores YYYY-MM-DD. Also accepts DD/MM/YYYY, DD/MM, and MM/YYYY.
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
// Validate one line without writing. Exit stock is checked for the whole cart.
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

// Check the cart against stock already read. Write nothing if one line fails.
const assertExitStock = (drafts) => {
  const demand = new Map()
  for (const draft of drafts) {
    if (!draft.isExit) continue
    const key = String(draft.product._id)
    const row = demand.get(key) || {
      name: draft.product.productName,
      qty: 0,
      available: roundQty(draft.product.productStock)
    }
    row.qty = roundQty(row.qty + draft.quantity)
    demand.set(key, row)
  }

  for (const row of demand.values()) {
    if (row.available < row.qty) {
      throw insufficientStockError(row.available, row.qty, row.name)
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

// Apply the stock change, then save. Roll this line back if the save fails.
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

// ValidationError and CastError become 400.
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

const undoStockChanges = async (stockChanges) => {
  let failed = false
  for (const change of stockChanges.reverse()) {
    try {
      await adjustStock(change.productId, -change.stockChange, { force: true })
    } catch {
      try {
        await adjustStock(change.productId, -change.stockChange, {
          force: true
        })
      } catch {
        failed = true
      }
    }
  }
  return failed
}

// Body is [records] or { records }. Checks exit stock, then inserts ids only.
const createInventoryRecords = async (req, res) => {
  const { body = {} } = req
  const records = Array.isArray(body) ? body : body.records

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      message: 'Se requiere un arreglo "records" con al menos un movimiento'
    })
  }

  const authenticatedUserId = req.user?.id || req.userId
  const appliedStock = []
  let insertedIds = []

  try {
    const typeIds = [
      ...new Set(records.map((row) => String(row?.typeInventory || '')))
    ]
    const paymentIds = [
      ...new Set(
        records
          .map((row) => row?.paymentType)
          .filter((id) => id !== undefined && id !== null && id !== '')
          .map(String)
      )
    ]
    const productIds = [
      ...new Set(records.map((row) => String(row?.productName || '')))
    ]

    const [types, payments, products] = await Promise.all([
      TypeInventory.find({ _id: { $in: typeIds.filter(isValidObjectId) } }),
      paymentIds.length
        ? PaymentType.find({
            _id: { $in: paymentIds.filter(isValidObjectId) }
          })
        : Promise.resolve([]),
      Product.find({ _id: { $in: productIds.filter(isValidObjectId) } })
    ])

    const typeById = new Map(types.map((doc) => [String(doc._id), doc]))
    const paymentById = new Map(payments.map((doc) => [String(doc._id), doc]))
    const productById = new Map(products.map((doc) => [String(doc._id), doc]))

    const drafts = []
    for (const payload of records) {
      let inventoryType = typeById.get(String(payload?.typeInventory || ''))
      if (!inventoryType) {
        inventoryType = await getInventoryType(payload?.typeInventory)
      }

      const paymentRaw = payload?.paymentType
      let paymentType = null
      if (paymentRaw !== undefined && paymentRaw !== null && paymentRaw !== '') {
        paymentType = paymentById.get(String(paymentRaw)) || null
        if (!paymentType) paymentType = await getPaymentType(paymentRaw)
      }

      let product = productById.get(String(payload?.productName || ''))
      if (!product) {
        if (!isValidObjectId(payload?.productName)) {
          const error = new Error('ID de producto inválido')
          error.status = 400
          throw error
        }
        product = await Product.findById(payload.productName)
        if (!product) {
          const error = new Error('Producto no encontrado')
          error.status = 404
          throw error
        }
      }

      const clientDate = String(payload.date || '').trim()
      if (!CLIENT_DATE.test(clientDate)) {
        const error = new Error('La fecha es requerida con formato YYYY-MM-DD')
        error.status = 400
        throw error
      }

      const quantity = roundQty(payload.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        const error = new Error('Cantidad inválida')
        error.status = 400
        throw error
      }

      if (!authenticatedUserId) {
        const error = new Error('Usuario no autenticado')
        error.status = 401
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

      drafts.push({
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
      })
    }

    assertExitStock(drafts)

    const stockByProduct = new Map()
    for (const draft of drafts) {
      const key = String(draft.product._id)
      const delta = stockDelta(draft.inventoryType, draft.quantity)
      const row = stockByProduct.get(key) || {
        productId: draft.product._id,
        name: draft.product.productName,
        delta: 0
      }
      row.delta = roundQty(row.delta + delta)
      stockByProduct.set(key, row)
    }

    const stockRows = [...stockByProduct.values()].filter((row) => row.delta !== 0)
    const settled = await Promise.allSettled(
      stockRows.map(async (row) => {
        const updatedProduct = await adjustStock(row.productId, row.delta)
        if (!updatedProduct) {
          const current = await Product.findById(row.productId).select(
            'productStock productName'
          )
          throw insufficientStockError(
            current?.productStock,
            Math.abs(row.delta),
            current?.productName || row.name
          )
        }
        return {
          productId: row.productId,
          stockChange: row.delta
        }
      })
    )
    for (const item of settled) {
      if (item.status === 'fulfilled') appliedStock.push(item.value)
    }
    const failedStock = settled.find((item) => item.status === 'rejected')
    if (failedStock) throw failedStock.reason

    const docs = drafts.map((draft) => ({
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
    }))

    const inserted = await InventoryRecord.insertMany(docs, { ordered: true })
    insertedIds = inserted.map((doc) => doc._id)
    res.status(201).json(insertedIds)
  } catch (rawError) {
    const error = toHttpError(rawError)
    let rollbackFailed = false

    if (insertedIds.length > 0) {
      try {
        await InventoryRecord.deleteMany({ _id: { $in: insertedIds } })
      } catch {
        rollbackFailed = true
      }
    }

    if (appliedStock.length > 0) {
      rollbackFailed = (await undoStockChanges(appliedStock)) || rollbackFailed
    }

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
      failedAt: 0
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

    // Reverse the old movement, then apply the new one.
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

// Deleting a movement reverses its stock change.
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
