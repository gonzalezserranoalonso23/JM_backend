import { Router } from 'express'
import {
  getSupplier,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} from '../controllers/Suppliers.controllers.js'
import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getSuppliers)
router.get('/:id', verifyToken, getSupplier)
router.post('/', verifyToken, createSupplier)
router.put('/:id', verifyToken, updateSupplier)
router.delete('/:id', verifyToken, requireAdmin, deleteSupplier)

export default router
