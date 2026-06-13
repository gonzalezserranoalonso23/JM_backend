import { Router } from 'express'
import {
  loginUser,
  getUsers,
  getUser,
  registerUser,
  updateUser,
  deleteUser
} from '../controllers/Users.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = Router()
// path login, loginUser controller to validate login
router.post('/login', loginUser)
// path users/login, registerUser controller to register in database
router.post('/register', verifyToken, registerUser)
// path users/register, getUsers controlller to get all users
router.get('/', verifyToken, getUsers)
//  path users and id param, getUser controller to get one user
router.get('/:id', verifyToken, getUser)
// path user, id param and method put. updateUser controller to update data of user
router.put('/:id', verifyToken, updateUser)
// path delete, id param and method delete. deleteUser controller to delete one user only
router.delete('/:id', verifyToken, deleteUser)

export default router
