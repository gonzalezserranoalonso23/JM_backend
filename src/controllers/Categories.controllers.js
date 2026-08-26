import CategoriesModel from '../models/Categories.models.js'
import { isValidObjectId } from 'mongoose'

const getCategories = async (req, res) => {
  try {
    const data = await CategoriesModel.find()
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar las categorías', error: error.message })
  }
}

const getCategory = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await CategoriesModel.findById(id)
    if (!data)
      return res.status(404).json({ message: 'Categoría no encontrada' })
    res.status(200).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al cargar la categoría', error: error.message })
  }
}

const createCategory = async (req, res) => {
  const { categories } = req.body
  if (!categories)
    return res
      .status(400)
      .json({ message: 'El nombre de la categoría es requerido' })
  try {
    const newCategory = new CategoriesModel({ categories })
    const data = await newCategory.save()
    res.status(201).json(data)
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al crear la categoría', error: error.message })
  }
}

const updateCategory = async (req, res) => {
  const { id } = req.params
  const { categories } = req.body
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await CategoriesModel.findOneAndUpdate(
      { _id: id },
      { categories },
      { new: true }
    )
    if (!data)
      return res.status(404).json({ message: 'Categoría no encontrada' })
    res.status(200).json(data)
  } catch (error) {
    res.status(500).json({
      message: 'Error al actualizar la categoría',
      error: error.message
    })
  }
}

const deleteCategory = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await CategoriesModel.deleteOne({ _id: id })
    if (data.deletedCount === 0)
      return res.status(404).json({ message: 'Categoría no encontrada' })
    res.status(200).json({ message: 'Categoría eliminada exitosamente' })
  } catch (error) {
    res
      .status(500)
      .json({ message: 'Error al eliminar la categoría', error: error.message })
  }
}

export {
  getCategory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
}
