import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  getVaultUpdatedAt,
  openVault,
  saveVault
} from './denominations.controller.js'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()

const vaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Demasiados intentos, intenta más tarde' }
})

router.get('/', verifyToken, getVaultUpdatedAt)
router.post('/open', verifyToken, requireAdmin, vaultLimiter, openVault)
router.put('/', verifyToken, requireAdmin, vaultLimiter, saveVault)

export default router
