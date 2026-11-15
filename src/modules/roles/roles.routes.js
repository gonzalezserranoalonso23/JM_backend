import { Router } from 'express'
import {
  getRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole
} from './roles.controller.js'
import verifyToken, { requireSudo } from '../../middlewares/verifyToken.js'

const router = Router()

router.get('/', verifyToken, getRoles)
router.get('/:id', verifyToken, getRole)
router.post('/', verifyToken, requireSudo, createRole)
router.put('/:id', verifyToken, requireSudo, updateRole)
router.delete('/:id', verifyToken, requireSudo, deleteRole)

export default router
