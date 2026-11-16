import InventoryRecord from '../models/inventoryRecords.model.js'
import Product from '../models/products.model.js'
import TypeInventory from '../models/typeInventory.model.js'
import { isValidObjectId, Types } from 'mongoose'
import {
  CATEGORY_FIELDS,
  PAYMENT_TYPE_FIELDS,
  PRODUCT_NAME_FIELDS,
  PRODUCT_REPORT_FIELDS,
  SUPPLIER_FIELDS,
  TYPE_INVENTORY_FIELDS
} from './projections.js'
import { roundMoney } from './money.js'
import {
  createPaginatedResponse,
  getPagination
} from './pagination.js'
import { productTokenMatch, searchTokens } from './productSearch.js'

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/

const toDouble = (input) => ({
  $convert: { input, to: 'double', onError: null, onNull: null }
})

// One Mongo pass: count, total, distinct products, and profit by type.
// Profit uses stored record prices; falls back to the product when missing.
const summarizeMovements = async (match) => {
  const rows = await InventoryRecord.aggregate([
    { $match: match },
    {
      $lookup: {
        from: TypeInventory.collection.collectionName,
        localField: 'typeInventory',
        foreignField: '_id',
        as: 'type'
      }
    },
    { $unwind: '$type' },
    {
      $lookup: {
        from: Product.collection.collectionName,
        localField: 'productName',
        foreignField: '_id',
        pipeline: [{ $project: { purchasePrice: 1 } }],
        as: 'product'
      }
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        salePrice: toDouble('$productPrice'),
        costPrice: toDouble({
          $ifNull: ['$purchasePrice', '$product.purchasePrice']
        }),
        lineQuantity: { $ifNull: ['$quantity', 0] },
        lineTotal: toDouble('$totalAmount')
      }
    },
    {
      $group: {
        _id: '$typeInventory',
        stockDirection: { $first: '$type.stockDirection' },
        count: { $sum: 1 },
        totalAmount: { $sum: { $ifNull: ['$lineTotal', 0] } },
        products: { $addToSet: '$productName' },
        profit: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$type.stockDirection', -1] },
                  { $ne: ['$salePrice', null] },
                  { $ne: ['$costPrice', null] }
                ]
              },
              {
                $multiply: [
                  { $subtract: ['$salePrice', '$costPrice'] },
                  '$lineQuantity'
                ]
              },
              0
            ]
          }
        }
      }
    }
  ])

  const summary = {}
  let totalRevenue = 0
  for (const row of rows) {
    const totalAmount = roundMoney(row.totalAmount)
    summary[String(row._id)] = {
      count: row.count,
      totalAmount,
      profit: roundMoney(row.profit),
      products: row.products.length
    }
    if (Number(row.stockDirection) === -1) totalRevenue += totalAmount
  }

  return { summary, totalRevenue: roundMoney(totalRevenue) }
}

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

    const payments = []
    let totalSales = 0
    for (const row of grouped) {
      const total = roundMoney(Number(row.total) || 0)
      totalSales += total
      if (!row._id) continue
      payments.push({ paymentType: row._id, total })
    }

    return res.status(200).json({
      date,
      payments,
      totalSales: roundMoney(totalSales)
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: 'Error al obtener las ventas del día',
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
    const issueTypes = await TypeInventory.find({ stockDirection: -1 })
      .select('_id')
      .lean()
    const issueIds = issueTypes.map((type) => type._id)
    const exitMatch = issueIds.length
      ? { date, typeInventory: { $in: issueIds } }
      : null

    const [totals] = exitMatch
      ? await InventoryRecord.aggregate([
          { $match: exitMatch },
          {
            $group: {
              _id: null,
              totalSales: { $sum: '$totalAmount' },
              totalTransactions: { $sum: 1 },
              productsSold: { $sum: '$quantity' }
            }
          }
        ])
      : []

    res.status(200).json({
      date,
      totalSales: roundMoney(totals?.totalSales || 0),
      totalTransactions: totals?.totalTransactions || 0,
      productsSold: roundMoney(totals?.productsSold || 0)
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al obtener resumen diario',
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
      const tokens = searchTokens(search)
      if (!tokens.length) {
        return res
          .status(200)
          .json(
            pagination.requested
              ? createPaginatedResponse([], 0, pagination)
              : []
          )
      }
      Object.assign(filter, productTokenMatch(tokens))
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
      .lean()

    if (!pagination.requested) {
      return res.status(200).json(await query)
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
    console.error(error)
    res.status(500).json({
      message: 'Error al obtener productos con stock bajo',
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
      .populate('productName', PRODUCT_REPORT_FIELDS)
      .select('-User')
      .sort({ date: -1 })
      .lean()

    const records = pagination.requested
      ? await query.skip(pagination.skip).limit(pagination.limit)
      : await query

    const summaryFilter = {
      date: { $gte: startDate, $lte: endDate }
    }
    if (filter.paymentType) {
      summaryFilter.paymentType = new Types.ObjectId(filter.paymentType)
    }
    const { summary, totalRevenue } = await summarizeMovements(summaryFilter)
    const byType = Object.fromEntries(
      Object.entries(summary).map(([typeId, row]) => [
        typeId,
        { count: row.count, totalAmount: row.totalAmount }
      ])
    )

    const base = {
      startDate,
      endDate,
      totalRevenue,
      byType,
      summary
    }

    if (!pagination.requested) {
      return res.status(200).json({
        ...base,
        totalRecords: records.length,
        allRecords: records
      })
    }

    const total = await InventoryRecord.countDocuments(filter)
    return res.status(200).json({
      ...createPaginatedResponse(records, total, pagination),
      ...base,
      totalRecords: total,
      allRecords: records
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al obtener ventas por rango de fecha',
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

    const pagination = getPagination(req.query)
    if (pagination.error) {
      return res.status(400).json({ message: pagination.error })
    }

    const query = InventoryRecord.find({ typeInventory: type })
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .populate('category', CATEGORY_FIELDS)
      .select('-User')
      .sort({ date: -1 })
      .lean()

    if (!pagination.requested) {
      const records = await query
      return res.status(200).json({
        type,
        count: records.length,
        records
      })
    }

    const filter = { typeInventory: type }
    const [records, total] = await Promise.all([
      query.skip(pagination.skip).limit(pagination.limit),
      InventoryRecord.countDocuments(filter)
    ])

    return res.status(200).json({
      ...createPaginatedResponse(records, total, pagination),
      type,
      count: total
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al obtener inventario por tipo',
    })
  }
}

const getInventoryStats = async (req, res) => {
  try {
    // Active products only. The dashboard does not scan movement history.
    const productRows = await Product.aggregate([
      { $match: { isActive: { $ne: false } } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalInventoryValue: {
            $sum: { $multiply: ['$productStock', '$productPrice'] }
          },
          lowStockProducts: {
            $sum: {
              $cond: [{ $lt: ['$productStock', '$minimumProductStock'] }, 1, 0]
            }
          },
          outOfStockProducts: {
            $sum: { $cond: [{ $eq: ['$productStock', 0] }, 1, 0] }
          }
        }
      }
    ])

    const products = productRows[0] || {}

    res.status(200).json({
      totalProducts: products.totalProducts || 0,
      totalInventoryValue: roundMoney(products.totalInventoryValue || 0),
      lowStockProducts: products.lowStockProducts || 0,
      outOfStockProducts: products.outOfStockProducts || 0,
      totalSalesValue: 0,
      totalMovements: 0
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al obtener estadísticas de inventario',
    })
  }
}

export {
  getLiveInformation,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
}
