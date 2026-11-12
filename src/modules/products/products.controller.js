/**
 * Products. Base: /api/products (token)
 *
 * GET    /            query { page, limit, search }
 * GET    /promotions  query { page, limit, search, category }
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

const getProductLookup = async (_req, res) => {
  try {
    const data = await ProductsModel.find()
      .select(LOOKUP_FIELDS)
      .sort({ productName: 1 })
      .lean()
    return res.status(200).json(data)
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
