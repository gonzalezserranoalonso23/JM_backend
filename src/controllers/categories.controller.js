/**
 * Product categories. Base: /api/categories (token)
 *
 * GET    /      query { page, limit, search }. Without them, returns every row.
 * GET    /:id   params { id }
 * POST   /      { categories }
 * PUT    /:id   params { id }, { categories }
 * DELETE /:id   params { id }. Full access.
 */
import CategoriesModel from '../models/categories.model.js'
import { isValidObjectId } from 'mongoose'
import { createPaginatedResponse, getPagination } from '../utils/pagination.js'

const getCategories = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const query = CategoriesModel.find().lean()
    if (!pagination.requested) {
      const data = await query.sort({ categories: 1 })
      return res.status(200).json(data)
    }

    const [data, total] = await Promise.all([
      CategoriesModel.find()
        .sort({ categories: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      CategoriesModel.countDocuments()
    ])

    return res
      .status(200)
      .json(createPaginatedResponse(data, total, pagination))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar las categorías' })
  }
}

const getCategory = async (req, res) => {
  const { id } = req.params
  if (!isValidObjectId(id))
    return res.status(400).json({ message: 'ID inválido' })
  try {
    const data = await CategoriesModel.findById(id).lean()
    if (!data)
      return res.status(404).json({ message: 'Categoría no encontrada' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error al cargar la categoría' })
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
    console.error(error)
    res.status(500).json({ message: 'Error al crear la categoría' })
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
      { returnDocument: 'after' }
    ).lean()
    if (!data)
      return res.status(404).json({ message: 'Categoría no encontrada' })
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({
      message: 'Error al actualizar la categoría'
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
    console.error(error)
    res.status(500).json({ message: 'Error al eliminar la categoría' })
  }
}

export {
  getCategory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
}
