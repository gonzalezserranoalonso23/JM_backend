import { Router } from 'express'
import {
  getProduct,
  getProductLookup,
  getProducts,
  getPromotionProducts,
  createProduct,
  updateProduct,
  deleteProduct
} from './products.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getProducts)
router.get('/promotions', verifyToken, getPromotionProducts)
router.get('/lookup', verifyToken, getProductLookup)
router.get('/:id', verifyToken, getProduct)
router.post('/', verifyToken, requireAdmin, createProduct)
router.put('/:id', verifyToken, requireAdmin, updateProduct)
router.delete('/:id', verifyToken, requireAdmin, deleteProduct)

export default router
