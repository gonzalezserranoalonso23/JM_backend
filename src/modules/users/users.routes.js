import { Router } from 'express'
import {
  loginUser,
  getUsers,
  getAssignableUsers,
  getCurrentUser,
  getUser,
  registerUser,
  updateUser,
  deleteUser,
  logoutUser,
  revokeUserSessions
} from './users.controller.js'
import rateLimit from 'express-rate-limit'
import verifyToken, { requireAdmin } from '../../middlewares/verifyToken.js'

const router = Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Demasiados intentos, intenta más tarde' }
})
router.post('/login', loginLimiter, loginUser)
router.post('/logout', verifyToken, logoutUser)
router.post('/:id/logout', verifyToken, requireAdmin, revokeUserSessions)
router.post('/register', verifyToken, requireAdmin, registerUser)
router.get('/assignable', verifyToken, getAssignableUsers)
router.get('/me', verifyToken, getCurrentUser)
router.get('/', verifyToken, requireAdmin, getUsers)
router.get('/:id', verifyToken, requireAdmin, getUser)
router.put('/:id', verifyToken, requireAdmin, updateUser)
router.delete('/:id', verifyToken, requireAdmin, deleteUser)

export default router
