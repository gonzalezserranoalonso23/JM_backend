import { Router } from 'express'
import {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder
} from '../controllers/Orders.controllers.js'
import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getOrders)
router.get('/:id', verifyToken, getOrder)
router.post('/', verifyToken, createOrder)
router.put('/:id', verifyToken, updateOrder)
router.delete('/:id', verifyToken, requireAdmin, deleteOrder)

export default router
