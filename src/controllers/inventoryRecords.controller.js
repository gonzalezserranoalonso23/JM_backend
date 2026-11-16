/**
 * Inventory movements. stockDirection adds or subtracts product stock.
 * Base: /api/inventory-records (token)
 */
import InventoryRecord from '../models/inventoryRecords.model.js'
import Product from '../models/products.model.js'
import { isValidObjectId } from 'mongoose'
import {
  CATEGORY_FIELDS,
  PAYMENT_TYPE_FIELDS,
  PRODUCT_NAME_FIELDS,
  TYPE_INVENTORY_FIELDS
} from '../utils/projections.js'
import { lineTotal } from '../utils/money.js'
import {
  createPaginatedResponse,
  getPagination
} from '../utils/pagination.js'
import {
  adjustStock,
  buildInventoryListFilter,
  createBulkInventoryRecords,
  createSingleInventoryRecord,
  getInventoryType,
  getPaymentType,
  insufficientStockError,
  roundQty,
  stockDelta,
  toHttpError
} from '../services/inventoryRecords.service.js'
import {
  getLiveInformation,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
} from '../utils/inventoryRecordsReports.js'

const populateRecord = (id) =>
  InventoryRecord.findById(id)
    .populate('typeInventory', TYPE_INVENTORY_FIELDS)
    .populate('paymentType', PAYMENT_TYPE_FIELDS)
    .populate('productName', PRODUCT_NAME_FIELDS)
    .populate('category', CATEGORY_FIELDS)
    .select('-User')
    .lean()

const getInventoryRecords = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const filter = await buildInventoryListFilter(req.query)
    const query = InventoryRecord.find(filter)
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .populate('category', CATEGORY_FIELDS)
      .select('-User')
      .sort({ date: -1, _id: -1 })
      .lean()

    if (!pagination.requested) {
      // Safety cap for unpaginated listing on a growing collection.
      return res.status(200).json(await query.limit(500))
    }

    const [data, total] = await Promise.all([
      query.skip(pagination.skip).limit(pagination.limit),
      InventoryRecord.countDocuments(filter)
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    const httpError = toHttpError(error)
    if (httpError.status) {
      return res.status(httpError.status).json({ message: httpError.message })
    }
    console.error(error)
    return res.status(500).json({
      message: 'Hubo un error al cargar los registros de inventario!',
    })
  }
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
    .lean()
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Registro de inventario no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) => {
      console.error(error)
      res.status(500).json({
        message: 'Hubo un error el registro de inventario!',
      })
    })
}

const createInventoryRecord = async (req, res) => {
  try {
    const authenticatedUserId = req.user?.id || req.userId
    const populatedRecord = await createSingleInventoryRecord(
      req.body,
      authenticatedUserId,
      { populateRecord }
    )

    res.status(201).json(populatedRecord)
  } catch (rawError) {
    const error = toHttpError(rawError)
    if (!error.status) console.error(rawError)
    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : 'Ha ocurrido un error al crear el registro de inventario',
      availableStock: error.availableStock,
      requestedQuantity: error.requestedQuantity,
      productName: error.productName,
    })
  }
}

const createInventoryRecords = async (req, res) => {
  const { body = {} } = req
  const records = Array.isArray(body) ? body : body.records

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      message: 'Se requiere un arreglo "records" con al menos un movimiento'
    })
  }

  const authenticatedUserId = req.user?.id || req.userId

  try {
    const { insertedIds } = await createBulkInventoryRecords(
      records,
      authenticatedUserId
    )
    res.status(201).json(insertedIds)
  } catch (rawError) {
    const error = toHttpError(rawError)
    if (error.rollbackFailed || !error.status) console.error(rawError)
    res.status(error.rollbackFailed ? 500 : error.status || 500).json({
      message: error.rollbackFailed
        ? error.message
        : error.status
          ? error.message
          : 'Ha ocurrido un error al crear el registro de inventario',
      availableStock: error.rollbackFailed ? undefined : error.availableStock,
      requestedQuantity: error.rollbackFailed ? undefined : error.requestedQuantity,
      productName: error.rollbackFailed ? undefined : error.productName,
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
    next.quantity = roundQty(next.quantity)

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
    ).lean()
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
    console.error(error)
    res.status(500).json({
      message: 'Ha ocurrido un error al actualizar el registro de inventario !  '
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
    const httpError = toHttpError(error)
    if (httpError.status) {
      return res.status(httpError.status).json({ message: httpError.message })
    }
    console.error(error)
    res.status(500).json({
      message: 'Hubo un error al intentar borrar el registro de inventario  '
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
