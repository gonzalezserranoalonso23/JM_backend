import { Router } from 'express'
import {
  getSupplier,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} from './suppliers.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getSuppliers)
router.get('/:id', verifyToken, getSupplier)
router.post('/', verifyToken, requireAdmin, createSupplier)
router.put('/:id', verifyToken, requireAdmin, updateSupplier)
router.delete('/:id', verifyToken, requireAdmin, deleteSupplier)

export default router
