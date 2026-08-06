import CategoriesModel from '../models/Categories.models.js'
import { isValidObjectId } from 'mongoose'

const getCategories = (req, res) => {
  CategoriesModel.find()
    .then((data) => {
      res.status(200).json(data)
    })
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar la categoría!',
        error
      })
    )
}

const getCategory = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })
  CategoriesModel.findById(id)
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Hubo un error al cargar la categoría!',
        error
      })
    )
}
const createCategory = (req, res) => {
  const { categories } = req.body

  const newCategory = new CategoriesModel({
    categories
  })
  newCategory
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al crear la categoría ',
        error
      })
    )
}

const updateCategory = (req, res) => {
  const { id } = req.params
  const { categories } = req.body
  console.log(id, categories)
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: 'Ha ocurrido un error en la peticion'
    })
  CategoriesModel.findOneAndUpdate(
    { _id: id },
    {
      categories
    },
    { new: true }
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: 'Ha ocurrido un error al actualizar la categoría',
        error
      })
    )
}

const deleteCategory = (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(501).json({ message: 'Hubo un error en la petición' })

  CategoriesModel.deleteOne({ _id: id })
    .then(() =>
      res
        .status(201)
        .json({ message: 'La categoría se ha borrado exitosamente!' })
    )
    .catch((error) =>
      res.status(505).json({
        message: 'Hubo un error al intentar borrar la categoría ',
        error
      })
    )
}

export {
  getCategory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
}
