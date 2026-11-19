import { Router } from 'express'
import {
  getProduct,
  getProductLookup,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct
} from '../controllers/products.controller.js'
import verifyToken, { requireAdmin } from '../middleware/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getProducts)
router.get('/lookup', verifyToken, getProductLookup)
router.get('/:id', verifyToken, getProduct)
router.post('/', verifyToken, requireAdmin, createProduct)
router.put('/:id', verifyToken, requireAdmin, updateProduct)
router.delete('/:id', verifyToken, requireAdmin, deleteProduct)

export default router
