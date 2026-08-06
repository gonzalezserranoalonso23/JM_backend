import { Router } from 'express'
import {
  getDailyInformation,
  getDailyInformations,
  createDailyInformation,
  updateDailyInformation,
  deleteDailyInformation
} from '../controllers/DailyInformation.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getDailyInformations)
router.get('/:id', verifyToken, getDailyInformation)
router.post('/', verifyToken, createDailyInformation)
router.put('/:id', verifyToken, updateDailyInformation)
router.delete('/:id', verifyToken, deleteDailyInformation)

export default router
