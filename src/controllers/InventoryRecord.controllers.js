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
    return res.status(400).json({ message: 'ID inválido' })
  InventoryRecord.findById(id)
    .populate('category', { __v: 0 })
    .populate('productName', { __v: 0 })
    .populate('User', { __v: 0, password: 0 })
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
const createSingleInventoryRecord = async (payload, authenticatedUserId) => {
  const { date, typeInventory, productName, category, Observations } = payload

  // Los campos numéricos pueden llegar como string desde el formulario;
  // sin castear, `productStock + quantity` concatenaba strings en vez de sumar.
  const productPrice = payload.productPrice
  const quantity = Number(payload.quantity)
  const totalAmount = Number(payload.totalAmount)

  const normalizedType = normalizeInventoryType(typeInventory)
  if (!normalizedType) {
    const error = new Error('Tipo de inventario inválido. Use ENTRY o ISSUE')
    error.status = 400
    throw error
  }

  if (!isValidObjectId(productName)) {
    const error = new Error('ID de producto inválido')
    error.status = 400
    throw error
  }

  if (!category || !isValidObjectId(category)) {
    const error = new Error('Categoría inválida o no seleccionada')
    error.status = 400
    throw error
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    const error = new Error('Cantidad inválida')
    error.status = 400
    throw error
  }

  if (!Number.isFinite(totalAmount)) {
    const error = new Error('Total inválido')
    error.status = 400
    throw error
  }

  const product = await Product.findById(productName)
  if (!product) {
    const error = new Error('Producto no encontrado')
    error.status = 404
    throw error
  }

  const isExit = isIssueType(normalizedType)

  if (isExit && product.productStock < quantity) {
    const error = new Error('Stock insuficiente')
    error.status = 400
    error.availableStock = product.productStock
    error.requestedQuantity = quantity
    throw error
  }

  if (!authenticatedUserId) {
    const error = new Error('Usuario no autenticado')
    error.status = 401
    throw error
  }

  const newInventoryRecord = new InventoryRecord({
    date,
    typeInventory: normalizedType,
    productName,
    category,
    productPrice,
    quantity,
    totalAmount,
    Observations,
    User: authenticatedUserId
  })

  const savedRecord = await newInventoryRecord.save()

  const isEntry = !isExit
  const stockChange = isEntry ? quantity : -quantity
  const newStock = product.productStock + stockChange

  await Product.findByIdAndUpdate(
    productName,
    { productStock: newStock },
    { new: true }
  )

  if (isExit && date) {
    const dateStr = date.toString().split('T')[0] // Formato YYYY-MM-DD
    const dailyInfo = await DailyInformation.findOne({ date: dateStr })

    if (dailyInfo) {
      dailyInfo.totalSales += totalAmount
      dailyInfo.totalTransactions += 1
      await dailyInfo.save()
    }
  }

  return InventoryRecord.findById(savedRecord._id)
    .populate('productName', { __v: 0 })
    .populate('category', { __v: 0 })
    .populate('User', { __v: 0, password: 0 })
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
    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : 'Ha ocurrido un error al crear el registro de inventario',
      availableStock: error.availableStock,
      requestedQuantity: error.requestedQuantity,
      error: error.status ? undefined : error.message,
      created
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
    return res.status(400).json({ message: 'ID inválido' })
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
    .then((data) => {
      if (!data)
        return res
          .status(404)
          .json({ message: 'Registro de inventario no encontrado' })
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(500).json({
        message:
          'Ha ocurrido un error al actualizar el registro de inventario !  ',
        error
      })
    )
}

const deleteInventoryRecord = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })

  InventoryRecord.deleteOne({ _id: id })
    .then((result) => {
      if (result.deletedCount === 0)
        return res
          .status(404)
          .json({ message: 'Registro de inventario no encontrado' })
      res.status(200).json({
        message: 'El registro de inventario se ha borrado exitosamente!'
      })
    })
    .catch((error) =>
      res.status(500).json({
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
  createInventoryRecords,
  updateInventoryRecord,
  deleteInventoryRecord,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
}
