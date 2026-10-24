import { Router } from 'express'
import {
  getProduct,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct
} from './products.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getProducts)
router.get('/:id', verifyToken, getProduct)
router.post('/', verifyToken, requireAdmin, createProduct)
router.put('/:id', verifyToken, requireAdmin, updateProduct)
router.delete('/:id', verifyToken, requireAdmin, deleteProduct)

export default router
