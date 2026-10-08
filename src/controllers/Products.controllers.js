import ProductsModel from '../models/Products.models.js'
import SuppliersModel from '../models/ Suppliers.models.js'
import CategoriesModel from '../models/Categories.models.js'
import { isValidObjectId } from 'mongoose'
import {
  createPaginatedResponse,
  escapeRegex,
  getPagination
} from '../utils/pagination.js'

const getProducts = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const search = req.query?.search?.trim()
    let filter = {}
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' }
      const [suppliers, categories] = await Promise.all([
        SuppliersModel.find({ suppliersName: regex }, { _id: 1 }).lean(),
        CategoriesModel.find({ categories: regex }, { _id: 1 }).lean()
      ])
      filter = {
        $or: [
          { productName: regex },
          { supplier: { $in: suppliers.map((item) => item._id) } },
          { category: { $in: categories.map((item) => item._id) } }
        ]
      }
    }
    const query = ProductsModel.find(filter)
      .populate('category', { __v: 0 })
      .populate('supplier', { __v: 0 })
      .lean()

    if (!pagination.requested) {
      const data = await query
      return res.status(200).json(data)
    }

    const [data, total] = await Promise.all([
      query
        .sort({ productName: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      ProductsModel.countDocuments(filter)
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar los productos', error: error.message })
  }
}

const getProduct = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await ProductsModel.findById(id)
      .populate('category', { __v: 0 })
      .populate('supplier', { __v: 0 })
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
      { new: true }
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

export { getProduct, getProducts, createProduct, updateProduct, deleteProduct }
