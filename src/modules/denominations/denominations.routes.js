import { Router } from 'express'
import {
  getVaultUpdatedAt,
  openVault,
  saveVault
} from './denominations.controller.js'
import verifyToken from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getVaultUpdatedAt)
router.post('/open', verifyToken, openVault)
router.put('/', verifyToken, saveVault)

export default router
