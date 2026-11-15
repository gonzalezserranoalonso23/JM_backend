import { Router } from 'express'
import {
  getTypeInventory,
  getTypeInventories,
  createTypeInventory,
  updateTypeInventory,
  deleteTypeInventory
} from '../controllers/typeInventory.controller.js'

import verifyToken, { requireAdmin } from '../middleware/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getTypeInventories)
router.get('/:id', verifyToken, getTypeInventory)
router.post('/', verifyToken, requireAdmin, createTypeInventory)
router.put('/:id', verifyToken, requireAdmin, updateTypeInventory)
router.delete('/:id', verifyToken, requireAdmin, deleteTypeInventory)

export default router
