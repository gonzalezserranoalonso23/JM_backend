import { Router } from 'express'
import { getRoles, getRole } from './roles.controller.js'
import verifyToken from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getRoles)
router.get('/:id', verifyToken, getRole)

export default router
