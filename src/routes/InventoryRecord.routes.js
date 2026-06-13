import { Router } from 'express'
import {
  getInventoryRecord,
  getInventoryRecords,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord
} from '../controllers/InventoryRecord.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getInventoryRecords)
router.get('/:id', verifyToken, getInventoryRecord)
router.post('/', verifyToken, createInventoryRecord)
router.put('/:id', verifyToken, updateInventoryRecord)
router.delete('/:id', verifyToken, deleteInventoryRecord)

export default router
