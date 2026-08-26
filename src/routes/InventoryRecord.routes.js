import { Router } from 'express'
import {
  getInventoryRecord,
  getInventoryRecords,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord,
  getDailySalesSummary,
  getLowStockProducts,
  getSalesByDateRange,
  getInventoryByType,
  getInventoryStats
} from '../controllers/InventoryRecord.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getInventoryRecords)
router.get('/reports/daily-summary', verifyToken, getDailySalesSummary)
router.get('/reports/low-stock', verifyToken, getLowStockProducts)
router.get('/reports/date-range', verifyToken, getSalesByDateRange)
router.get('/reports/by-type', verifyToken, getInventoryByType)
router.get('/reports/stats', verifyToken, getInventoryStats)
router.get('/:id', verifyToken, getInventoryRecord)
router.post('/', verifyToken, createInventoryRecord)
router.put('/:id', verifyToken, updateInventoryRecord)
router.delete('/:id', verifyToken, deleteInventoryRecord)

export default router
