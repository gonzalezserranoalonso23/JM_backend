import ProductsModel from '../models/Products.models.js'
import { isValidObjectId } from 'mongoose'

const getProducts = async (req, res) => {
  try {
    const data = await ProductsModel.find()
      .populate('category', { __v: 0 })
      .populate('supplier', { __v: 0 })
    res.status(200).json(data)
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
    category
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
      category
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
    category
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
        category
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
