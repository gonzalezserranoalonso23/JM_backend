import Task from '../models/Tasks.models.js'

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('createdBy', 'username email fullName')
      .populate('completedBy', 'username email fullName')
      .sort({ createdAt: -1 })

    res.status(200).json(tasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('createdBy', 'username email fullName')
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
    const { title, description, priority } = req.body
    const userId = req.user.id

    if (!title) {
      return res.status(400).json({ message: 'El título es requerido' })
    }

    const newTask = new Task({
      title,
      description: description || '',
      priority: priority || 'medium',
      createdBy: userId,
      status: 'pending'
    })

    await newTask.save()

    const populatedTask = await newTask.populate(
      'createdBy',
      'username email fullName'
    )

    res.status(201).json(populatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const updateTask = async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, priority, status } = req.body
    const userId = req.user.id

    const task = await Task.findById(id)
    if (!task) {
      return res.status(404).json({ message: 'Tarea no encontrada' })
    }

    if (title) task.title = title
    if (description !== undefined) task.description = description
    if (priority) task.priority = priority

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
      .populate('createdBy', 'username email fullName')
      .populate('completedBy', 'username email fullName')

    res.status(200).json(updatedTask)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params

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
      .populate('createdBy', 'username email fullName')
      .sort({ createdAt: -1 })

    res.status(200).json(pendingTasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getCompletedTasks = async (req, res) => {
  try {
    const completedTasks = await Task.find({ status: 'completed' })
      .populate('createdBy', 'username email fullName')
      .populate('completedBy', 'username email fullName')
      .sort({ completedAt: -1 })

    res.status(200).json(completedTasks)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
