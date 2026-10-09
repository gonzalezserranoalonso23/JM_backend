import { Router } from 'express'
import {
  loginUser,
  getUsers,
  getUser,
  registerUser,
  updateUser,
  deleteUser
} from '../controllers/Users.controllers.js'
import rateLimit from 'express-rate-limit'
import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { message: 'Demasiados intentos, intenta más tarde' }
})
// path login, loginUser controller to validate login
router.post('/login', loginLimiter, loginUser)
// path users/login, registerUser controller to register in database
router.post('/register', verifyToken, requireAdmin, registerUser)
// path users/register, getUsers controlller to get all users
router.get('/', verifyToken, requireAdmin, getUsers)
//  path users and id param, getUser controller to get one user
router.get('/:id', verifyToken, requireAdmin, getUser)
// path user, id param and method put. updateUser controller to update data of user
router.put('/:id', verifyToken, requireAdmin, updateUser)
// path delete, id param and method delete. deleteUser controller to delete one user only
router.delete('/:id', verifyToken, requireAdmin, deleteUser)

export default router
