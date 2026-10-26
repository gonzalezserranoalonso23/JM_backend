import InventoryRecord from './inventory-records.model.js'
import Product from '../products/products.model.js'
import TypeInventory from '../type-inventory/type-inventory.model.js'
import PaymentType from '../payment-types/payment-types.model.js'
import { isValidObjectId, Types } from 'mongoose'
import {
  CATEGORY_FIELDS,
  PAYMENT_TYPE_FIELDS,
  PRODUCT_NAME_FIELDS,
  PRODUCT_REPORT_FIELDS,
  SUPPLIER_FIELDS,
  TYPE_INVENTORY_FIELDS
} from '../../utils/projections.js'
import { roundMoney } from '../../utils/money.js'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../../utils/pagination.js'
import { isIssueType } from './inventory-records.shared.js'

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

const toDouble = (input) => ({
  $convert: { input, to: 'double', onError: null, onNull: null }
})

// Una pasada en Mongo: conteo, total, productos distintos y utilidad por tipo.
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
    const records = await InventoryRecord.find({ date })
      .populate('typeInventory', TYPE_INVENTORY_FIELDS)
      .populate('paymentType', PAYMENT_TYPE_FIELDS)
      .populate('productName', PRODUCT_NAME_FIELDS)
      .lean()

    const exits = records.filter((record) => isIssueType(record.typeInventory))
    const totalSales = exits.reduce(
      (sum, record) => sum + parseFloat(record.totalAmount),
      0
    )

    res.status(200).json({
      date,
      totalSales,
      totalTransactions: exits.length,
      productsSold: exits.length,
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
      .populate('productName', PRODUCT_REPORT_FIELDS)
      .select('-User')
      .sort({ date: -1 })
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

    const response = {
      startDate,
      endDate,
      totalRevenue,
      totalRecords: records.length,
      byType,
      allRecords: records,
      summary
    }

    if (!pagination.requested) return res.status(200).json(response)

    const total = await InventoryRecord.countDocuments(filter)
    return res.status(200).json({
      ...createPaginatedResponse(records, total, pagination),
      ...response
    })
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

    const totalValue = allProducts.reduce(
      (sum, product) => sum + product.productStock * product.productPrice,
      0
    )
    const exits = allRecords.filter((record) =>
      isIssueType(record.typeInventory)
    )

    res.status(200).json({
      totalProducts: allProducts.length,
      totalInventoryValue: totalValue,
      lowStockProducts: allProducts.filter(
        (product) => product.productStock < product.minimumProductStock
      ).length,
      outOfStockProducts: allProducts.filter(
        (product) => product.productStock === 0
      ).length,
      totalSalesValue: exits.reduce(
        (sum, record) => sum + parseFloat(record.totalAmount),
        0
      ),
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
  getLiveInformation,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
}
