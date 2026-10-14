import { Router } from 'express'
import {
  getTypeInventory,
  getTypeInventories,
  createTypeInventory,
  updateTypeInventory,
  deleteTypeInventory
} from '../controllers/TypeInventory.controllers.js'

import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getTypeInventories)
router.get('/:id', verifyToken, getTypeInventory)
router.post('/', verifyToken, createTypeInventory)
router.put('/:id', verifyToken, updateTypeInventory)
router.delete('/:id', verifyToken, requireAdmin, deleteTypeInventory)

export default router
