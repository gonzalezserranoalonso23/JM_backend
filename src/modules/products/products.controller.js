/**
 * Products. Base: /api/products (token)
 *
 * GET    /            query { page, limit, search }
 * GET    /promotions  query { page, limit, search, category }
 * GET    /lookup      query { search, active }. Tokens, filler words dropped.
 * GET    /:id         params { id }
 * POST   /            { productName, productDescription, purchasePrice, productPrice, minimumProductStock, productStock, supplier, category, isActive }
 * PUT    /:id         params { id }, same body as POST
 * DELETE /:id         params { id }. Full access.
 */
import { CATEGORY_FIELDS, SUPPLIER_FIELDS } from '../../utils/projections.js'
import ProductsModel from './products.model.js'
import SuppliersModel from '../suppliers/suppliers.model.js'
import CategoriesModel from '../categories/categories.model.js'
import mongoose, { isValidObjectId } from 'mongoose'
import {
  accentInsensitiveRegex,
  createPaginatedResponse,
  getPagination
} from '../../utils/pagination.js'

const getProducts = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const search = req.query?.search?.trim()
    const listed = () =>
      ProductsModel.find()
        .populate('category', CATEGORY_FIELDS)
        .populate('supplier', SUPPLIER_FIELDS)
        .lean()

    if (!search) {
      const query = listed()
      if (!pagination.requested) {
        const data = await query
        return res.status(200).json(data)
      }
      const [data, total] = await Promise.all([
        query
          .sort({ productName: 1 })
          .skip(pagination.skip)
          .limit(pagination.limit),
        ProductsModel.countDocuments()
      ])
      return res
        .status(200)
        .json(createPaginatedResponse(data, total, pagination))
    }

// Name matches come first. A supplier match must not push the product off page one.
    const pattern = accentInsensitiveRegex(search)
    const regex = { $regex: pattern, $options: 'i' }
    const suppliers = await SuppliersModel.find(
      { suppliersName: regex },
      { _id: 1 }
    ).lean()
    const supplierIds = suppliers.map((item) => item._id)
    const textMatch = {
      $or: [
        { $regexMatch: { input: '$productName', regex: pattern, options: 'i' } },
        {
          $regexMatch: {
            input: { $ifNull: ['$productDescription', ''] },
            regex: pattern,
            options: 'i'
          }
        }
      ]
    }
    const match = {
      $or: [{ productName: regex }, { productDescription: regex }]
    }
    if (supplierIds.length) match.$or.push({ supplier: { $in: supplierIds } })

    const project = (fields) =>
      Object.fromEntries(fields.split(' ').map((field) => [field, 1]))
    const [result] = await ProductsModel.aggregate([
      { $match: match },
      { $addFields: { textHit: textMatch } },
      { $sort: { textHit: -1, productName: 1 } },
      {
        $facet: {
          meta: [{ $count: 'total' }],
          data: [
            { $skip: pagination.skip },
            { $limit: pagination.limit },
            {
              $lookup: {
                from: CategoriesModel.collection.name,
                localField: 'category',
                foreignField: '_id',
                pipeline: [{ $project: project(CATEGORY_FIELDS) }],
                as: 'category'
              }
            },
            {
              $lookup: {
                from: SuppliersModel.collection.name,
                localField: 'supplier',
                foreignField: '_id',
                pipeline: [{ $project: project(SUPPLIER_FIELDS) }],
                as: 'supplier'
              }
            },
            {
              $set: {
                category: { $ifNull: [{ $arrayElemAt: ['$category', 0] }, null] },
                supplier: { $ifNull: [{ $arrayElemAt: ['$supplier', 0] }, null] }
              }
            },
            { $unset: 'textHit' }
          ]
        }
      }
    ])
    const data = result?.data ?? []
    const total = result?.meta?.[0]?.total ?? 0

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar los productos', error: error.message })
  }
}

const MIN_MARGIN = 30

const margin = {
  $round: [
    {
      $multiply: [
        {
          $divide: [
            { $subtract: ['$productPrice', '$purchasePrice'] },
            '$productPrice'
          ]
        },
        100
      ]
    },
    2
  ]
}

const getPromotionProducts = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  const match = {
    isActive: { $ne: false },
    productPrice: { $gt: 0 },
    $expr: { $gte: [margin, MIN_MARGIN] }
  }
  const search =
    typeof req.query?.search === 'string' ? req.query.search.trim() : ''
  if (search) {
    const pattern = accentInsensitiveRegex(search)
    const regex = { $regex: pattern, $options: 'i' }
    match.$or = [{ productName: regex }, { productDescription: regex }]
  }
  const { category } = req.query
  if (category) {
    if (!isValidObjectId(category)) {
      return res.status(400).json({ message: 'Categoría inválida' })
    }
    match.category = new mongoose.Types.ObjectId(category)
  }

  try {
    const project = (fields) =>
      Object.fromEntries(fields.split(' ').map((field) => [field, 1]))
    const pageStages = pagination.requested
      ? [{ $skip: pagination.skip }, { $limit: pagination.limit }]
      : []
    const [result] = await ProductsModel.aggregate([
      { $match: match },
      { $addFields: { margin } },
      { $sort: { productName: 1 } },
      {
        $facet: {
          meta: [{ $count: 'total' }],
          data: [
            ...pageStages,
            {
              $lookup: {
                from: CategoriesModel.collection.name,
                localField: 'category',
                foreignField: '_id',
                pipeline: [{ $project: project(CATEGORY_FIELDS) }],
                as: 'category'
              }
            },
            {
              $set: {
                category: { $ifNull: [{ $arrayElemAt: ['$category', 0] }, null] }
              }
            }
          ]
        }
      }
    ])
    const data = result?.data ?? []
    const total = result?.meta?.[0]?.total ?? 0
    if (!pagination.requested) {
      return res.status(200).json(data)
    }
    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar los productos en promoción',
      error: error.message
    })
  }
}

const LOOKUP_FIELDS = {
  productName: 1,
  productDescription: 1,
  productStock: 1,
  purchasePrice: 1,
  productPrice: 1,
  category: 1,
  supplier: 1,
  isActive: 1
}

const FILLER = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'y',
  'a',
  'en',
  'con',
  'un',
  'una',
  'por',
  'para',
  'al',
  'lo'
])
const WORD = /[a-z0-9]+/g

const foldText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const searchTokens = (query) => {
  const tokens = foldText(query).match(WORD) ?? []
  return tokens.filter((token) => token.length > 1 && !FILLER.has(token))
}

const rankLookup = (rows, tokens) => {
  const ranked = rows.map((product) => {
    const name = foldText(product.productName)
    const inName = tokens.every((token) => name.includes(token))
    return { product, rank: inName ? 0 : 1, name }
  })
  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'es'))
  return ranked.map((item) => item.product)
}

const getProductLookup = async (req, res) => {
  try {
    const { query = {} } = req
    const { search = '', active } = query
    const tokens = searchTokens(search)
    if (!tokens.length) return res.status(200).json([])

    const filter = {
      $and: tokens.map((token) => ({
        $or: [
          {
            productName: {
              $regex: accentInsensitiveRegex(token),
              $options: 'i'
            }
          },
          {
            productDescription: {
              $regex: accentInsensitiveRegex(token),
              $options: 'i'
            }
          }
        ]
      }))
    }
    if (active === '1') filter.isActive = { $ne: false }

    const rows = await ProductsModel.find(filter)
      .select(LOOKUP_FIELDS)
      .limit(40)
      .lean()

    return res.status(200).json(rankLookup(rows, tokens).slice(0, 20))
  } catch (error) {
    return res.status(500).json({
      message: 'Error al cargar los productos',
      error: error.message
    })
  }
}

const getProduct = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await ProductsModel.findById(id)
      .populate('category', CATEGORY_FIELDS)
      .populate('supplier', SUPPLIER_FIELDS)
    if (!data)
      return res.status(404).json({ message: 'Producto no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar el producto', error: error.message })
  }
}

const createProduct = async (req, res) => {
  const {
    productName,
    productDescription,
    purchasePrice,
    productPrice,
    minimumProductStock,
    productStock,
    supplier,
    category,
    isActive
  } = req.body
  if (!productName)
    return res
      .status(400)
      .json({ message: 'El nombre del producto es requerido' })
  if (
    purchasePrice === undefined ||
    purchasePrice === null ||
    purchasePrice === ''
  )
    return res
      .status(400)
      .json({ message: 'El precio de compra del producto es requerido' })
  if (
    productPrice === undefined ||
    productPrice === null ||
    productPrice === ''
  )
    return res
      .status(400)
      .json({ message: 'El precio de venta del producto es requerido' })
  try {
    const newProduct = new ProductsModel({
      productName,
      productDescription,
      purchasePrice: Number(purchasePrice),
      productPrice: Number(productPrice),
      minimumProductStock,
      productStock,
      supplier,
      category,
      isActive
    })
    const data = await newProduct.save()
    res.status(201).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al crear el producto', error: error.message })
  }
}

const updateProduct = async (req, res) => {
  const { id } = req.params
  const {
    productName,
    productDescription,
    purchasePrice,
    productPrice,
    productStock,
    minimumProductStock,
    supplier,
    category,
    isActive
  } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await ProductsModel.findOneAndUpdate(
      { _id: id },
      {
        productName,
        productDescription,
        purchasePrice:
          purchasePrice !== undefined ? Number(purchasePrice) : undefined,
        productPrice:
          productPrice !== undefined ? Number(productPrice) : undefined,
        productStock,
        minimumProductStock,
        supplier,
        category,
        isActive
      },
      { returnDocument: 'after' }
    )
    if (!data)
      return res.status(404).json({ message: 'Producto no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    res.status(500).json({
      message: 'Error al actualizar el producto',
      error: error.message
    })
  }
}

const deleteProduct = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await ProductsModel.deleteOne({ _id: id })
    if (data.deletedCount === 0)
      return res.status(404).json({ message: 'Producto no encontrado' })
    res.status(200).json({ message: 'Producto eliminado exitosamente' })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al eliminar el producto', error: error.message })
  }
}

export {
  getProduct,
  getProductLookup,
  getProducts,
  getPromotionProducts,
  createProduct,
  updateProduct,
  deleteProduct
}
