import { Router } from 'express'
import {
  getVapidKey,
  subscribePush,
  unsubscribePush
} from '../controllers/pushNotifications.controller.js'
import verifyToken from '../middleware/verifyToken.js'

const router = Router()

router.get('/vapid-public-key', verifyToken, getVapidKey)
router.post('/subscribe', verifyToken, subscribePush)
router.delete('/subscribe', verifyToken, unsubscribePush)

export default router
