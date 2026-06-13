import { Router } from 'express'
import {
  getSupplier,
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} from '../controllers/Suppliers.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getSuppliers)
router.get('/:id', verifyToken, getSupplier)
router.post('/', verifyToken, createSupplier)
router.put('/:id', verifyToken, updateSupplier)
router.delete('/:id', verifyToken, deleteSupplier)

export default router
