import { Router } from 'express'
import {
  getCategory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/Categories.controllers.js'
import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getCategories)
router.get('/:id', verifyToken, getCategory)
router.post('/', verifyToken, createCategory)
router.put('/:id', verifyToken, updateCategory)
router.delete('/:id', verifyToken, requireAdmin, deleteCategory)

export default router
