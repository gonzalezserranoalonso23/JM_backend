import Task from '../models/Tasks.models.js'
import User from '../models/Users.models.js'
import { isValidObjectId } from 'mongoose'

const USER_FIELDS = 'username email fullName'

// Devuelve null si no hay asignado, undefined si es inválido o no existe
const resolveAssignee = async (value) => {
  if (value === undefined || value === null || value === '') return null
  if (!isValidObjectId(value)) return undefined
  const exists = await User.exists({ _id: value })
  return exists ? value : undefined
}

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('createdBy', USER_FIELDS)
      .populate('assignedTo', USER_FIELDS)
      .populate('completedBy', 'username email fullName')
      .sort({ createdAt: -1 })

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
    const task = await Task.findById(req.params.id)
      .populate('createdBy', USER_FIELDS)
      .populate('assignedTo', USER_FIELDS)
      .populate('completedBy', 'username email fullName')

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

    const updatedTask = await Task.findById(id)
      .populate('createdBy', USER_FIELDS)
      .populate('assignedTo', USER_FIELDS)
      .populate('completedBy', 'username email fullName')

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

    res.status(200).json({ message: 'Tarea eliminada exitosamente', task })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getPendingTasks = async (req, res) => {
  try {
    const pendingTasks = await Task.find({ status: 'pending' })
      .populate('createdBy', USER_FIELDS)
      .populate('assignedTo', USER_FIELDS)
      .sort({ createdAt: -1 })

    res.status(200).json(pendingTasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getCompletedTasks = async (req, res) => {
  try {
    const completedTasks = await Task.find({ status: 'completed' })
      .populate('createdBy', USER_FIELDS)
      .populate('assignedTo', USER_FIELDS)
      .populate('completedBy', 'username email fullName')
      .sort({ completedAt: -1 })

    res.status(200).json(completedTasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
