import { Router } from 'express'
import {
  getProduct,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/Products.controllers.js'
import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getProducts)
router.get('/:id', verifyToken, getProduct)
router.post('/', verifyToken, createProduct)
router.put('/:id', verifyToken, updateProduct)
router.delete('/:id', verifyToken, requireAdmin, deleteProduct)

export default router
