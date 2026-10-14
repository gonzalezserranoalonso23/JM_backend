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
import verifyToken, { requireAdmin } from '../middlewares/verifyToken.js'

const router = express.Router()

router.get('/', verifyToken, getTasks)
router.get('/pending', verifyToken, getPendingTasks)
router.get('/completed', verifyToken, getCompletedTasks)
router.get('/:id', verifyToken, getTask)
router.post('/', verifyToken, createTask)
router.put('/:id', verifyToken, updateTask)
router.delete('/:id', verifyToken, requireAdmin, deleteTask)

export default router
