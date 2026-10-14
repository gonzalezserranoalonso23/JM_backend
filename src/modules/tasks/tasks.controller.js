/**
 * Tareas internas asignables a usuarios. Base: /api/tasks (requiere token)
 * Todas las respuestas incluyen createdBy/assignedTo/completedBy (username, email, fullName).
 *
 * GET    /           -> getTasks           todas, más recientes primero
 * GET    /pending    -> getPendingTasks
 * GET    /completed  -> getCompletedTasks  ordenadas por completedAt
 * GET    /:id        -> getTask            params: id
 * POST   /           -> createTask         body: { title*, description, priority = 'medium', assignedTo } (createdBy = token)
 * PUT    /:id        -> updateTask         params: id | body: { title, description, priority, status, assignedTo }
 *                                          status 'completed' registra completedBy/completedAt; 'pending' los limpia
 * DELETE /:id        -> deleteTask         params: id (solo admin)
 */
import { USER_FIELDS } from '../../utils/projections.js'
import Task from './tasks.model.js'
import User from '../users/users.model.js'
import { isValidObjectId } from 'mongoose'

const withUsers = (query) =>
  query
    .populate('createdBy', USER_FIELDS)
    .populate('assignedTo', USER_FIELDS)
    .populate('completedBy', USER_FIELDS)

// Devuelve null si no hay asignado, undefined si es inválido o no existe
const resolveAssignee = async (value) => {
  if (value === undefined || value === null || value === '') return null
  if (!isValidObjectId(value)) return undefined
  const exists = await User.exists({ _id: value })
  return exists ? value : undefined
}

export const getTasks = async (req, res) => {
  try {
    const tasks = await withUsers(Task.find()).sort({ createdAt: -1 }).lean()

    res.status(200).json(tasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getTask = async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  try {
    const task = await withUsers(Task.findById(req.params.id)).lean()

    if (!task) {
      return res.status(404).json({ message: 'Tarea no encontrada' })
    }

    res.status(200).json(task)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const createTask = async (req, res) => {
  try {
    const { title, description, priority, assignedTo } = req.body
    const userId = req.user.id

    if (!title) {
      return res.status(400).json({ message: 'El título es requerido' })
    }

    const assignee = await resolveAssignee(assignedTo)
    if (assignee === undefined) {
      return res.status(400).json({ message: 'Usuario asignado inválido' })
    }

    const newTask = new Task({
      title,
      description: description || '',
      priority: priority || 'medium',
      assignedTo: assignee,
      createdBy: userId,
      status: 'pending'
    })

    await newTask.save()

    const populatedTask = await newTask.populate([
      { path: 'createdBy', select: USER_FIELDS },
      { path: 'assignedTo', select: USER_FIELDS }
    ])

    res.status(201).json(populatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const updateTask = async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, priority, status, assignedTo } = req.body
    const userId = req.user.id

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID inválido' })
    }

    const task = await Task.findById(id)
    if (!task) {
      return res.status(404).json({ message: 'Tarea no encontrada' })
    }

    if (title) task.title = title
    if (description !== undefined) task.description = description
    if (priority) task.priority = priority

    if (assignedTo !== undefined) {
      const assignee = await resolveAssignee(assignedTo)
      if (assignee === undefined) {
        return res.status(400).json({ message: 'Usuario asignado inválido' })
      }
      task.assignedTo = assignee
    }

    if (status && status !== task.status) {
      task.status = status
      if (status === 'completed') {
        task.completedBy = userId
        task.completedAt = new Date()
      } else if (status === 'pending') {
        task.completedBy = null
        task.completedAt = null
      }
    }

    await task.save()

    const updatedTask = await withUsers(Task.findById(id)).lean()

    res.status(200).json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID inválido' })
    }

    const task = await Task.findByIdAndDelete(id)

    if (!task) {
      return res.status(404).json({ message: 'Tarea no encontrada' })
    }

    res.status(200).json({ message: 'Tarea eliminada exitosamente' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getPendingTasks = async (req, res) => {
  try {
    const pendingTasks = await withUsers(Task.find({ status: 'pending' }))
      .sort({ createdAt: -1 })
      .lean()

    res.status(200).json(pendingTasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getCompletedTasks = async (req, res) => {
  try {
    const completedTasks = await withUsers(Task.find({ status: 'completed' }))
      .sort({ completedAt: -1 })
      .lean()

    res.status(200).json(completedTasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
