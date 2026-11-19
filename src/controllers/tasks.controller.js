/**
 * Tasks. Base: /api/tasks (token)
 */
import { TASK_STATUS } from '../models/tasks.model.js'
import { publicFailure } from '../middleware/handleErrors.js'
import { getPagination } from '../utils/pagination.js'
import { isSudo } from '../models/roles.model.js'
import {
  createTaskRecord,
  deleteTaskRecord,
  getTaskById,
  hideSudoPeople,
  listTasks,
  listTasksByStatus,
  readPage,
  updateTaskRecord
} from '../services/tasks.service.js'

export const getTasks = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const tasks = await listTasks(req.query, {
      sort: { createdAt: -1 },
      pagination,
      actor: { role: req.role, userId: req.user.id }
    })
    res.status(200).json(hideSudoPeople(tasks, isSudo(req.role)))
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al cargar los pendientes', error)
  }
}

export const getTask = async (req, res) => {
  try {
    const task = await getTaskById(req.params.id, {
      role: req.role,
      userId: req.user.id
    })
    res.status(200).json(hideSudoPeople(task, isSudo(req.role)))
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al cargar el pendiente', error)
  }
}

export const createTask = async (req, res) => {
  try {
    const populatedTask = await createTaskRecord({
      body: req.body,
      userId: req.user.id,
      role: req.role
    })
    res.status(201).json(hideSudoPeople(populatedTask, isSudo(req.role)))
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al crear el pendiente', error)
  }
}

export const updateTask = async (req, res) => {
  try {
    const updatedTask = await updateTaskRecord({
      id: req.params.id,
      body: req.body,
      userId: req.user.id,
      role: req.role,
      req
    })
    res.status(200).json(hideSudoPeople(updatedTask, isSudo(req.role)))
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al actualizar el pendiente', error)
  }
}

export const deleteTask = async (req, res) => {
  try {
    await deleteTaskRecord({ id: req.params.id, req })
    res.status(200).json({ message: 'Pendiente eliminado' })
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al eliminar el pendiente', error)
  }
}

export const getPendingTasks = async (req, res) => {
  const pagination = readPage(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const pendingTasks = await listTasksByStatus(
      TASK_STATUS.pending,
      req.query,
      {
        role: req.role,
        userId: req.user.id
      }
    )
    res.status(200).json(hideSudoPeople(pendingTasks, isSudo(req.role)))
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al cargar los pendientes', error)
  }
}

export const getCompletedTasks = async (req, res) => {
  const pagination = readPage(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const completedTasks = await listTasksByStatus(
      TASK_STATUS.completed,
      req.query,
      { role: req.role, userId: req.user.id }
    )
    res.status(200).json(hideSudoPeople(completedTasks, isSudo(req.role)))
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ message: error.message })
    publicFailure(res, 500, 'Error al cargar los pendientes', error)
  }
}
