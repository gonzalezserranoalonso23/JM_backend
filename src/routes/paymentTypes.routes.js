import { Router } from 'express'
import {
  createPaymentType,
  deletePaymentType,
  getPaymentType,
  getPaymentTypes,
  updatePaymentType
} from '../controllers/paymentTypes.controller.js'
import verifyToken, { requireAdmin } from '../middleware/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getPaymentTypes)
router.get('/:id', verifyToken, getPaymentType)
router.post('/', verifyToken, requireAdmin, createPaymentType)
router.put('/:id', verifyToken, requireAdmin, updatePaymentType)
router.delete('/:id', verifyToken, requireAdmin, deletePaymentType)

export default router
