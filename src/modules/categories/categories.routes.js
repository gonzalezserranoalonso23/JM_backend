import { Router } from 'express'
import {
  getCategory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from './categories.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getCategories)
router.get('/:id', verifyToken, getCategory)
router.post('/', verifyToken, requireAdmin, createCategory)
router.put('/:id', verifyToken, requireAdmin, updateCategory)
router.delete('/:id', verifyToken, requireAdmin, deleteCategory)

export default router
