import express from 'express'
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  getPendingTasks,
  getCompletedTasks
} from '../controllers/Tasks.controllers.js'
import verifyToken from '../middlewares/verifyToken.js'

const router = express.Router()

router.get('/', verifyToken, getTasks)
router.get('/pending', verifyToken, getPendingTasks)
router.get('/completed', verifyToken, getCompletedTasks)
router.get('/:id', verifyToken, getTask)
router.post('/', verifyToken, createTask)
router.put('/:id', verifyToken, updateTask)
router.delete('/:id', verifyToken, deleteTask)

export default router
