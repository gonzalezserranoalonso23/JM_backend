import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  getAppStatus,
  requestSupport,
  shutdownApp,
  startupApp
} from '../controllers/appState.controller.js'
import verifyToken, { requireSudo } from '../middleware/verifyToken.js'

const router = Router()
const supportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Demasiados intentos, intenta más tarde' }
})

// Public. The disconnected screen reads this before anyone has a token.
router.get('/status', getAppStatus)
// Public. Compares the typed code with Railway_Activate. No verifyToken.
router.post('/support', supportLimiter, requestSupport)
router.post('/shutdown', verifyToken, requireSudo, shutdownApp)
router.post('/startup', verifyToken, requireSudo, startupApp)

export default router
