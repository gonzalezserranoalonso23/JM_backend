import { Router } from 'express'
import {
  getTypeInventory,
  getTypeInventories,
  createTypeInventory,
  updateTypeInventory,
  deleteTypeInventory
} from '../controllers/TypeInventory.controllers.js'

import verifyToken from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getTypeInventories)
router.get('/:id', verifyToken, getTypeInventory)
router.post('/', verifyToken, createTypeInventory)
router.put('/:id', verifyToken, updateTypeInventory)
router.delete('/:id', verifyToken, deleteTypeInventory)

export default router
