import { Router } from 'express'
import {
  createPaymentType,
  deletePaymentType,
  getPaymentType,
  getPaymentTypes,
  updatePaymentType
} from './payment-types.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getPaymentTypes)
router.get('/:id', verifyToken, getPaymentType)
router.post('/', verifyToken, requireAdmin, createPaymentType)
router.put('/:id', verifyToken, requireAdmin, updatePaymentType)
router.delete('/:id', verifyToken, requireAdmin, deletePaymentType)

export default router
