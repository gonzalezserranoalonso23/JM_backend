import { Router } from 'express'
import {
  getDailyInformation,
  getDailyInformations,
  createDailyInformation,
  updateDailyInformation,
  deleteDailyInformation
} from './daily-information.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getDailyInformations)
router.get('/:id', verifyToken, getDailyInformation)
router.post('/', verifyToken, requireAdmin, createDailyInformation)
router.put('/:id', verifyToken, requireAdmin, updateDailyInformation)
router.delete('/:id', verifyToken, requireAdmin, deleteDailyInformation)

export default router
