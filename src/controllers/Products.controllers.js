import ProductsModel from '../models/Products.models.js'
import { isValidObjectId } from 'mongoose'

const getProducts = (req, res) => {
  ProductsModel.find()
    .populate('category', { __v: 0 })
    .populate('supplier', { __v: 0 })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar el producto!',
        error
      })
    )
}

const getProduct = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })
  ProductsModel.findById(id)
    .populate('category', { __v: 0 })
    .populate('supplier', { __v: 0 })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar el producto!',
        error
      })
    )
}
const createProduct = (req, res) => {
  const {
    productName,
    productDescription,
    productPrice,
    minimumProductStock,
    productStock,
    supplier,
    category
  } = req.body

  const newProduct = new ProductsModel({
    productName,
    productDescription,
    productPrice,
    minimumProductStock,
    productStock,
    supplier,
    category
  })
  newProduct
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al crear el producto !',
        error
      })
    )
}

const updateProduct = (req, res) => {
  const { id } = req.params
  const {
    productName,
    productDescription,
    productPrice,
    productStock,
    minimumProductStock,
    supplier,
    category
  } = req.body
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  ProductsModel.findOneAndUpdate(
    { _id: id },
    {
      productName,
      productDescription,
      productPrice,
      productStock,
      minimumProductStock,
      supplier,
      category
    },
    { new: true }
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al actualizar el producto !  ',
        error
      })
    )
}

const deleteProduct = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })

  ProductsModel.deleteOne({ _id: id })
    .then(() =>
      res
        .status(201)
        .json({ message: 'El producto se ha borrado exitosamente!' })
    )
    .catch((error) =>
      res.status(505).json({
        message: 'Hubo un error al intentar borrar el producto ',
        error
      })
    )
}

export { getProduct, getProducts, createProduct, updateProduct, deleteProduct }
