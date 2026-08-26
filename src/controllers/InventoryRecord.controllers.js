import InventoryRecord from '../models/InventoryRecord.models.js'
import Product from '../models/Products.models.js'
import DailyInformation from '../models/DailyInformation.models.js'
import { isValidObjectId } from 'mongoose'

const ENTRY_TYPE = 'ENTRY'
const ISSUE_TYPE = 'ISSUE'

const normalizeInventoryType = (value = '') => {
  const normalized = String(value).trim().toUpperCase()

  if (['ENTRY', 'ENTRADA', 'IN'].includes(normalized)) return ENTRY_TYPE
  if (['ISSUE', 'SALIDA', 'OUT', 'VENTA'].includes(normalized)) {
    return ISSUE_TYPE
  }

  return null
}

const isIssueType = (value = '') => normalizeInventoryType(value) === ISSUE_TYPE

const getInventoryRecords = (req, res) => {
  InventoryRecord.find()
    .populate('productName', { __v: 0 })
    .populate('category', { __v: 0 })
    .populate('User', { __v: 0, password: 0 })
    .sort({ date: -1 })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar los registros de inventario!',
        error
      })
    )
}

const getInventoryRecord = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })
  InventoryRecord.findById(id)
    .populate('category', { __v: 0 })
    .populate('productName', { __v: 0 })
    .populate('User', { __v: 0, password: 0 })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error el registro de inventario!',
        error
      })
    )
}
const createInventoryRecord = async (req, res) => {
  try {
    const {
      date,
      typeInventory,
      productName,
      category,
      productPrice,
      quantity,
      totalAmount,
      Observations
    } = req.body

    // El tipo de inventario ahora es estático: ENTRY | ISSUE
    const normalizedType = normalizeInventoryType(typeInventory)
    if (!normalizedType) {
      return res.status(400).json({
        message: 'Tipo de inventario inválido. Use ENTRY o ISSUE'
      })
    }

    if (!isValidObjectId(productName)) {
      return res.status(400).json({ message: 'ID de producto inválido' })
    }

    // Obtener el producto
    const product = await Product.findById(productName)
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' })
    }

    // Validar stock disponible para salidas
    const isExit = isIssueType(normalizedType)

    if (isExit && product.productStock < quantity) {
      return res.status(400).json({
        message: 'Stock insuficiente',
        availableStock: product.productStock,
        requestedQuantity: quantity
      })
    }

    // Crear el registro de inventario
    const newInventoryRecord = new InventoryRecord({
      date,
      typeInventory: normalizedType,
      productName,
      category,
      productPrice,
      quantity,
      totalAmount,
      Observations,
      User: req.userId // Del token verificado
    })

    const savedRecord = await newInventoryRecord.save()

    // Actualizar stock del producto
    const isEntry = !isExit
    const stockChange = isEntry ? quantity : -quantity
    const newStock = product.productStock + stockChange

    await Product.findByIdAndUpdate(
      productName,
      { productStock: newStock },
      { new: true }
    )

    // Actualizar DailyInformation si es una salida (venta)
    if (isExit && date) {
      const dateStr = date.toString().split('T')[0] // Formato YYYY-MM-DD
      const dailyInfo = await DailyInformation.findOne({ date: dateStr })

      if (dailyInfo) {
        dailyInfo.totalSales += totalAmount
        dailyInfo.totalTransactions += 1
        await dailyInfo.save()
      }
    }

    // Retornar el registro poblado
    const populatedRecord = await InventoryRecord.findById(savedRecord._id)
      .populate('productName', { __v: 0 })
      .populate('category', { __v: 0 })
      .populate('User', { __v: 0, password: 0 })

    res.status(201).json(populatedRecord)
  } catch (error) {
    res.status(500).json({
      message: 'Ha ocurrido un error al crear el registro de inventario',
      error: error.message
    })
  }
}

const updateInventoryRecord = (req, res) => {
  const { id } = req.params
  const {
    date,
    typeInventory,
    productName,
    category,
    productPrice,
    quantity,
    totalAmount,
    Observations
  } = req.body
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  const normalizedType = normalizeInventoryType(typeInventory)
  if (!normalizedType)
    return res.status(400).json({
      message: 'Tipo de inventario inválido. Use ENTRY o ISSUE'
    })

  InventoryRecord.findOneAndUpdate(
    { _id: id },
    {
      date,
      typeInventory: normalizedType,
      productName,
      category,
      productPrice,
      quantity,
      totalAmount,
      Observations
    },
    { new: true }
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message:
          'Ha ocurrido un error al actualizar el registro de inventario !  ',
        error
      })
    )
}

const deleteInventoryRecord = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })

  InventoryRecord.deleteOne({ _id: id })
    .then(() =>
      res.status(201).json({
        message: 'El registro de inventario se ha borrado exitosamente!'
      })
    )
    .catch((error) =>
      res.status(505).json({
        message: 'Hubo un error al intentar borrar el registro de inventario  ',
        error
      })
    )
}

// REPORTES Y ANÁLISIS

const getDailySalesSummary = async (req, res) => {
  try {
    const { date } = req.query // Formato: YYYY-MM-DD

    const query = date ? { date: { $regex: date } } : {}

    const records = await InventoryRecord.find(query).populate('productName')

    // Filtrar solo salidas (ventas)
    const exits = records.filter((r) => isIssueType(r.typeInventory))

    const totalSales = exits.reduce(
      (sum, r) => sum + parseFloat(r.totalAmount),
      0
    )
    const totalTransactions = exits.length
    const productsSold = exits.length

    res.status(200).json({
      date: date || new Date().toISOString().split('T')[0],
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
  try {
    const products = await Product.find()
      .populate('category')
      .populate('supplier')

    const lowStockProducts = products.filter(
      (p) => p.productStock <= p.minimumProductStock
    )

    res.status(200).json(lowStockProducts)
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

    const records = await InventoryRecord.find({
      date: { $gte: startDate, $lte: endDate }
    })
      .populate('productName')
      .populate('User', { __v: 0, password: 0 })
      .sort({ date: -1 })

    // Agrupar por tipo de movimiento
    const byType = {}
    let totalRevenue = 0

    records.forEach((r) => {
      const typeName = normalizeInventoryType(r.typeInventory) || ENTRY_TYPE
      if (!byType[typeName]) {
        byType[typeName] = { count: 0, totalAmount: 0, records: [] }
      }
      byType[typeName].count += 1
      byType[typeName].totalAmount += parseFloat(r.totalAmount)
      byType[typeName].records.push(r)

      if (isIssueType(typeName)) {
        totalRevenue += parseFloat(r.totalAmount)
      }
    })

    res.status(200).json({
      startDate,
      endDate,
      totalRevenue,
      totalRecords: records.length,
      byType,
      allRecords: records
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

    const normalizedType = normalizeInventoryType(type)
    if (!normalizedType) {
      return res
        .status(400)
        .json({ message: 'Tipo de inventario inválido. Use ENTRY o ISSUE' })
    }

    const records = await InventoryRecord.find({
      typeInventory: normalizedType
    })
      .populate('productName', { __v: 0 })
      .populate('category', { __v: 0 })
      .populate('User', { __v: 0, password: 0 })
      .sort({ date: -1 })

    res.status(200).json({
      type: normalizedType,
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
    const allProducts = await Product.find()
    const allRecords = await InventoryRecord.find()

    const totalProducts = allProducts.length
    const totalValue = allProducts.reduce(
      (sum, p) => sum + p.productStock * p.productPrice,
      0
    )
    const lowStockCount = allProducts.filter(
      (p) => p.productStock <= p.minimumProductStock
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
  updateInventoryRecord,
  deleteInventoryRecord,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
}
