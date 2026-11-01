import { Router } from 'express'
import {
  getMyAttendance,
  getAttendanceDay,
  checkIn,
  checkOut
} from './attendance.controller.js'
import verifyToken from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/me', verifyToken, getMyAttendance)
router.get('/', verifyToken, getAttendanceDay)
router.post('/check-in', verifyToken, checkIn)
router.post('/check-out', verifyToken, checkOut)

export default router
