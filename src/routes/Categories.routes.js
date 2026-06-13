import { Router } from 'express'
import {
  getCategory,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/Categories.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getCategories)
router.get('/:id', verifyToken, getCategory)
router.post('/', verifyToken, createCategory)
router.put('/:id', verifyToken, updateCategory)
router.delete('/:id', verifyToken, deleteCategory)

export default router
