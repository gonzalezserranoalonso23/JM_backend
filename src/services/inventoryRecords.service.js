import InventoryRecord from '../models/inventoryRecords.model.js'
import Product from '../models/products.model.js'
import TypeInventory from '../models/typeInventory.model.js'
import PaymentType from '../models/paymentTypes.model.js'
import { isValidObjectId } from 'mongoose'
import { lineTotal } from '../utils/money.js'
import { productTokenMatch, searchTokens } from '../utils/productSearch.js'
import { isIssueType } from '../utils/inventoryRecordsShared.js'
import { escapeRegex } from '../utils/pagination.js'

export const getInventoryType = async (id) => {
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

export const getPaymentType = async (id) => {
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

export const stockDelta = (type, quantity) =>
  Number(type.stockDirection) * Number(quantity)

export const roundQty = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 1000) / 1000

// Subtract only when rounded stock (3 decimals) still covers the quantity.
export const adjustStock = (productId, delta, { force = false } = {}) => {
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

export const insufficientStockError = (
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

export const buildDateConditions = (search) => {
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

export const buildInventoryListFilter = async (queryParams = {}) => {
  const filter = {}
  if (queryParams?.type) {
    if (!isValidObjectId(queryParams.type)) {
      const error = new Error('ID de tipo de inventario inválido')
      error.status = 400
      throw error
    }
    filter.typeInventory = queryParams.type
  }

  if (queryParams?.paymentType) {
    if (!isValidObjectId(queryParams.paymentType)) {
      const error = new Error('ID de tipo de pago inválido')
      error.status = 400
      throw error
    }
    filter.paymentType = queryParams.paymentType
  }

  const direction = queryParams?.direction
  if (direction !== undefined && !['1', '-1'].includes(String(direction))) {
    const error = new Error('direction debe ser 1 o -1')
    error.status = 400
    throw error
  }

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

  const search = queryParams?.search?.trim()
  if (search) {
    const tokens = searchTokens(search)
    const products = tokens.length
      ? await Product.find(productTokenMatch(tokens), { _id: 1 }).lean()
      : []
    filter.$or = [
      { productName: { $in: products.map((item) => item._id) } },
      ...buildDateConditions(search)
    ]
  }

  return filter
}

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

const CLIENT_DATE = /^\d{4}-\d{2}-\d{2}$/

export const prepareInventoryRecord = async (payload, authenticatedUserId) => {
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

export const assertExitStock = (drafts) => {
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

export const persistInventoryRecord = async (draft, { populateRecord }) => {
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

export const createSingleInventoryRecord = async (
  payload,
  authenticatedUserId,
  { populateRecord }
) => {
  const draft = await prepareInventoryRecord(payload, authenticatedUserId)
  const { populated } = await persistInventoryRecord(draft, { populateRecord })
  return populated
}

export const toHttpError = (error) => {
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

export const undoStockChanges = async (stockChanges) => {
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

export const prepareBulkDraft = async (payload, authenticatedUserId, maps) => {
  const { typeById, paymentById, productById } = maps
  let inventoryType = typeById.get(String(payload?.typeInventory || ''))
  if (!inventoryType) inventoryType = await getInventoryType(payload?.typeInventory)

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

export const createBulkInventoryRecords = async (records, authenticatedUserId) => {
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

  const maps = {
    typeById: new Map(types.map((doc) => [String(doc._id), doc])),
    paymentById: new Map(payments.map((doc) => [String(doc._id), doc])),
    productById: new Map(products.map((doc) => [String(doc._id), doc]))
  }

  const drafts = []
  for (const payload of records) {
    drafts.push(await prepareBulkDraft(payload, authenticatedUserId, maps))
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

  const appliedStock = []
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
      return { productId: row.productId, stockChange: row.delta }
    })
  )
  for (const item of settled) {
    if (item.status === 'fulfilled') appliedStock.push(item.value)
  }
  const failedStock = settled.find((item) => item.status === 'rejected')

  let insertedIds = []
  try {
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
    return { insertedIds }
  } catch (error) {
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
    if (rollbackFailed) {
      const wrapped = new Error(
        'El carrito no se completó y no se pudo deshacer. Revisa los movimientos antes de volver a registrarlo.'
      )
      wrapped.status = 500
      wrapped.rollbackFailed = true
      throw wrapped
    }
    throw error
  }
}
