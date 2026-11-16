/**
 * Products. Base: /api/products (token)
 */
import { CATEGORY_FIELDS, SUPPLIER_FIELDS } from '../utils/projections.js'
import ProductsModel from '../models/products.model.js'
import { isValidObjectId } from 'mongoose'
import { getPagination } from '../utils/pagination.js'
import {
  findProductLookup,
  listProducts,
  listPromotionProducts
} from '../services/products.service.js'

const getProducts = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const result = await listProducts(req.query, pagination)
    return res.status(200).json(result)
  } catch (error) {
    console.error(error)
    return res
      .status(500)
      .json({ message: 'Error al cargar los productos' })
  }
}

const getPromotionProducts = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const result = await listPromotionProducts(req.query, pagination)
    return res.status(200).json(result)
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message })
    }
    console.error(error)
    return res.status(500).json({
      message: 'Error al cargar los productos en promoción',
    })
  }
}

const getProductLookup = async (req, res) => {
  try {
    const { query = {} } = req
    const rows = await findProductLookup(query)
    return res.status(200).json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: 'Error al cargar los productos',
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
      .lean()
    if (!data)
      return res.status(404).json({ message: 'Producto no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al cargar el producto' })
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
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al crear el producto' })
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
    ).lean()
    if (!data)
      return res.status(404).json({ message: 'Producto no encontrado' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al actualizar el producto',
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
    console.error(error)
    res
      .status(500)
      .json({ message: 'Error al eliminar el producto' })
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
