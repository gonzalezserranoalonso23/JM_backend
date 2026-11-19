import { isValidObjectId } from 'mongoose'
import { USER_FIELDS } from '../utils/projections.js'
import Task, { TASK_PRIORITY, TASK_STATUS } from '../models/tasks.model.js'
import User from '../models/users.model.js'
import { createPaginatedResponse, getPagination } from '../utils/pagination.js'
import { sendPushToUser } from '../utils/pushService.js'
import { grantsFullAccess, isSudo } from '../models/roles.model.js'

const asId = (value) => {
  if (!value) return ''
  if (typeof value === 'object') return String(value._id || value)
  return String(value)
}

export const canManageTask = (task, req) => {
  if (grantsFullAccess(req.role)) return true
  const userId = asId(req.userId || req.user?.id)
  if (!userId) return false
  return asId(task.createdBy) === userId || asId(task.assignedTo) === userId
}

const taskScope = ({ role, userId } = {}) => {
  if (grantsFullAccess(role)) return {}
  const id = asId(userId)
  if (!id) return { _id: null }
  return { $or: [{ createdBy: id }, { assignedTo: id }] }
}

const assertSelfAssignment = (assignee, userId, role) => {
  if (!grantsFullAccess(role) && assignee && asId(assignee) !== asId(userId)) {
    const error = new Error('Solo puedes asignar pendientes a ti mismo')
    error.status = 403
    throw error
  }
}

const notifyAssignee = (userId, task) => {
  const assigneeId = asId(userId)
  if (!assigneeId || !task) return
  sendPushToUser(assigneeId, {
    title: 'Pendiente asignado',
    body: task.title || 'Tienes un pendiente',
    url: '/todolist',
    tag: String(task._id || 'task')
  }).catch((error) => {
    console.error('Error al enviar la notificación del pendiente', error)
  })
}

const personPopulate = {
  select: `${USER_FIELDS} role`,
  populate: { path: 'role', select: 'name' }
}

export const withUsers = (query) =>
  query
    .populate({ path: 'createdBy', ...personPopulate })
    .populate({ path: 'assignedTo', ...personPopulate })
    .populate({ path: 'completedBy', ...personPopulate })

const hideSudoPerson = (person, actorIsSudo) => {
  if (!person || typeof person !== 'object') return person
  if (!actorIsSudo && isSudo(person.role?.name)) return null
  delete person.role
  return person
}

export const hideSudoPeople = (payload, actorIsSudo) => {
  const rows = Array.isArray(payload) ? payload : payload?.data
  if (!Array.isArray(rows)) {
    if (payload && payload._id) {
      for (const field of ['createdBy', 'assignedTo', 'completedBy']) {
        payload[field] = hideSudoPerson(payload[field], actorIsSudo)
      }
    }
    return payload
  }
  for (const task of rows) {
    for (const field of ['createdBy', 'assignedTo', 'completedBy']) {
      task[field] = hideSudoPerson(task[field], actorIsSudo)
    }
  }
  return payload
}

export const resolveAssignee = async (value) => {
  if (value === undefined || value === null || value === '') return null
  if (!isValidObjectId(value)) return undefined
  const user = await User.findById(value)
    .select('role')
    .populate('role', 'name')
    .lean()
  if (!user || isSudo(user.role?.name)) return undefined
  return value
}

const pageOf = async (filter, sort, pagination) => {
  const listed = () => withUsers(Task.find(filter)).sort(sort).lean()
  if (!pagination.requested) return listed()

  const [data, total] = await Promise.all([
    listed().skip(pagination.skip).limit(pagination.limit),
    Task.countDocuments(filter)
  ])
  return createPaginatedResponse(data, total, pagination)
}

export const readPage = (query = {}) =>
  getPagination({
    page: query.page ?? 1,
    limit: query.limit ?? 20
  })

export const listTasks = async (
  query = {},
  { sort, pagination, actor } = {}
) => {
  const pg = pagination || getPagination(query)
  if (pg.error) {
    const error = new Error(pg.error)
    error.status = 400
    throw error
  }
  return pageOf(taskScope(actor), sort || { createdAt: -1 }, pg)
}

export const listTasksByStatus = async (status, query = {}, actor = {}) => {
  const pg = readPage(query)
  if (pg.error) {
    const error = new Error(pg.error)
    error.status = 400
    throw error
  }
  const sort =
    status === TASK_STATUS.completed ? { completedAt: -1 } : { createdAt: -1 }
  return pageOf({ status, ...taskScope(actor) }, sort, pg)
}

export const getTaskById = async (id, actor = {}) => {
  if (!isValidObjectId(id)) {
    const error = new Error('ID inválido')
    error.status = 400
    throw error
  }
  const task = await withUsers(Task.findById(id)).lean()
  if (!task) {
    const error = new Error('Pendiente no encontrado')
    error.status = 404
    throw error
  }
  if (!canManageTask(task, actor)) {
    const error = new Error('Pendiente no encontrado')
    error.status = 404
    throw error
  }
  return task
}

export const createTaskRecord = async ({ body, userId, role }) => {
  const { title, description, priority, assignedTo } = body
  if (!title) {
    const error = new Error('El título es requerido')
    error.status = 400
    throw error
  }
  const assignee = await resolveAssignee(assignedTo)
  if (assignee === undefined) {
    const error = new Error('Usuario asignado inválido')
    error.status = 400
    throw error
  }
  assertSelfAssignment(assignee, userId, role)

  const newTask = await new Task({
    title,
    description: description || '',
    priority: priority || TASK_PRIORITY.medium,
    assignedTo: assignee,
    createdBy: userId,
    status: TASK_STATUS.pending
  }).save()

  const populatedTask = await withUsers(Task.findById(newTask._id)).lean()
  notifyAssignee(assignee, populatedTask)
  return populatedTask
}

export const updateTaskRecord = async ({ id, body, userId, role, req }) => {
  if (!isValidObjectId(id)) {
    const error = new Error('ID inválido')
    error.status = 400
    throw error
  }
  const task = await Task.findById(id)
  if (!task) {
    const error = new Error('Pendiente no encontrado')
    error.status = 404
    throw error
  }
  if (!canManageTask(task, req || { role, userId })) {
    const error = new Error('Solo puedes modificar un pendiente si es tuyo')
    error.status = 403
    throw error
  }

  const { title, description, priority, status, assignedTo } = body
  const previousAssigneeId = asId(task.assignedTo)
  let nextAssigneeId = previousAssigneeId

  if (title) task.title = title
  if (description !== undefined) task.description = description
  if (priority) task.priority = priority

  if (assignedTo !== undefined) {
    const assignee = await resolveAssignee(assignedTo)
    if (assignee === undefined) {
      const error = new Error('Usuario asignado inválido')
      error.status = 400
      throw error
    }
    assertSelfAssignment(assignee, userId, role)
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
  return updatedTask
}

export const deleteTaskRecord = async ({ id, req }) => {
  if (!isValidObjectId(id)) {
    const error = new Error('ID inválido')
    error.status = 400
    throw error
  }
  const task = await Task.findById(id).lean()
  if (!task) {
    const error = new Error('Pendiente no encontrado')
    error.status = 404
    throw error
  }
  if (!canManageTask(task, req)) {
    const error = new Error('Solo puedes eliminar un pendiente si es tuyo')
    error.status = 403
    throw error
  }
  await Task.findByIdAndDelete(id)
}
