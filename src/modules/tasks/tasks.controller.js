/**
 * Tasks. Base: /api/tasks (token). Responses include createdBy, assignedTo, completedBy.
 *
 * GET    /           query { page, limit }. Without them, every task, newest first.
 * GET    /pending    query { page, limit }. Defaults to the first 20.
 * GET    /completed  query { page, limit }. Defaults to the first 20, newest completion first.
 * GET    /:id        params { id }
 * POST   /           { title, description, priority, assignedTo }. createdBy comes from the token.
 * PUT    /:id        params { id }, { title, description, priority, status, assignedTo }
 * DELETE /:id        params { id }. Full access, creator, or assignee.
 */
import { USER_FIELDS } from '../../utils/projections.js'
import Task, { TASK_PRIORITY, TASK_STATUS } from './tasks.model.js'
import { publicFailure } from '../../middlewares/handleErrors.js'
import User from '../users/users.model.js'
import { isValidObjectId } from 'mongoose'
import {
  createPaginatedResponse,
  getPagination
} from '../../utils/pagination.js'
import { sendPushToUser } from '../push-notifications/push.service.js'
import { grantsFullAccess } from '../roles/roles.model.js'

const asId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value)
  return String(value)
}

const canManageTask = (task, req) => {
  if (grantsFullAccess(req.role)) return true
  const userId = asId(req.userId || req.user?.id)
  if (!userId) return false
  return asId(task.createdBy) === userId || asId(task.assignedTo) === userId
}

const notifyAssignee = (userId, task) => {
  const assigneeId = asId(userId)
  if (!assigneeId || !task) return
  void sendPushToUser(assigneeId, {
    title: 'Pendiente asignado',
    body: task.title || 'Tienes un pendiente',
    url: '/todolist',
    tag: String(task._id || 'task')
  }).catch(() => {})
}

const withUsers = (query) =>
  query
    .populate('createdBy', USER_FIELDS)
    .populate('assignedTo', USER_FIELDS)
    .populate('completedBy', USER_FIELDS)

// null: unassigned. undefined: missing or unknown user.
const resolveAssignee = async (value) => {
  if (value === undefined || value === null || value === '') return null
  if (!isValidObjectId(value)) return undefined
  const exists = await User.exists({ _id: value })
  return exists ? value : undefined
}

const pageOf = async (filter, sort, pagination) => {
  const listed = () => withUsers(Task.find(filter)).sort(sort)
  if (!pagination.requested) return listed().lean()

  const [data, total] = await Promise.all([
    listed().skip(pagination.skip).limit(pagination.limit).lean(),
    Task.countDocuments(filter)
  ])
  return createPaginatedResponse(data, total, pagination)
}

const readPage = (req) =>
  getPagination({
    page: req.query?.page ?? 1,
    limit: req.query?.limit ?? 20
  })

export const getTasks = async (req, res) => {
  const pagination = getPagination(req.query)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const tasks = await pageOf({}, { createdAt: -1 }, pagination)
    res.status(200).json(tasks)
  } catch (error) {
    publicFailure(res, 500, 'Error al cargar los pendientes', error)
  }
}

export const getTask = async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'ID inválido' })
  }

  try {
    const task = await withUsers(Task.findById(req.params.id)).lean()

    if (!task) {
      return res.status(404).json({ message: 'Pendiente no encontrado' })
    }

    res.status(200).json(task)
  } catch (error) {
    publicFailure(res, 500, 'Error al cargar el pendiente', error)
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
      priority: priority || TASK_PRIORITY.medium,
      assignedTo: assignee,
      createdBy: userId,
      status: TASK_STATUS.pending
    })

    await newTask.save()

    const populatedTask = await newTask.populate([
      { path: 'createdBy', select: USER_FIELDS },
      { path: 'assignedTo', select: USER_FIELDS }
    ])

    notifyAssignee(assignee, populatedTask)
    res.status(201).json(populatedTask)
  } catch (error) {
    publicFailure(res, 500, 'Error al crear el pendiente', error)
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
      return res.status(404).json({ message: 'Pendiente no encontrado' })
    }

    if (!canManageTask(task, req)) {
      return res
        .status(403)
        .json({ message: 'Solo puedes modificar un pendiente si es tuyo' })
    }

    const previousAssigneeId = asId(task.assignedTo)
    let nextAssigneeId = previousAssigneeId

    if (title) task.title = title
    if (description !== undefined) task.description = description
    if (priority) task.priority = priority

    if (assignedTo !== undefined) {
      const assignee = await resolveAssignee(assignedTo)
      if (assignee === undefined) {
        return res.status(400).json({ message: 'Usuario asignado inválido' })
      }
      task.assignedTo = assignee
      nextAssigneeId = asId(assignee)
    }

    if (status && status !== task.status) {
      task.status = status
      if (status === TASK_STATUS.completed) {
        task.completedBy = userId
        task.completedAt = new Date()
      } else if (status === TASK_STATUS.pending) {
        task.completedBy = null
        task.completedAt = null
      }
    }

    await task.save()

    const updatedTask = await withUsers(Task.findById(id)).lean()
    if (nextAssigneeId && nextAssigneeId !== previousAssigneeId) {
      notifyAssignee(nextAssigneeId, updatedTask)
    }

    res.status(200).json(updatedTask)
  } catch (error) {
    publicFailure(res, 500, 'Error al actualizar el pendiente', error)
  }
}

export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'ID inválido' })
    }

    const task = await Task.findById(id)

    if (!task) {
      return res.status(404).json({ message: 'Pendiente no encontrado' })
    }

    if (!canManageTask(task, req)) {
      return res
        .status(403)
        .json({ message: 'Solo puedes eliminar un pendiente si es tuyo' })
    }

    await Task.findByIdAndDelete(id)

    res.status(200).json({ message: 'Pendiente eliminado' })
  } catch (error) {
    publicFailure(res, 500, 'Error al eliminar el pendiente', error)
  }
}

export const getPendingTasks = async (req, res) => {
  const pagination = readPage(req)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const pendingTasks = await pageOf(
      { status: TASK_STATUS.pending },
      { createdAt: -1 },
      pagination
    )
    res.status(200).json(pendingTasks)
  } catch (error) {
    publicFailure(res, 500, 'Error al cargar los pendientes', error)
  }
}

export const getCompletedTasks = async (req, res) => {
  const pagination = readPage(req)
  if (pagination.error) {
    return res.status(400).json({ message: pagination.error })
  }

  try {
    const completedTasks = await pageOf(
      { status: TASK_STATUS.completed },
      { completedAt: -1 },
      pagination
    )
    res.status(200).json(completedTasks)
  } catch (error) {
    publicFailure(res, 500, 'Error al cargar los pendientes', error)
  }
}
