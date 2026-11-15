import UserModel from '../users/users.model.js'
import { isSudo } from '../roles/roles.model.js'
import { isShutdown, setShutdown } from './app-state.js'

export const getAppStatus = (req, res) => {
  res.status(200).json({ shutdown: isShutdown() })
}

export const shutdownApp = async (req, res) => {
  try {
    await setShutdown(true)
    await UserModel.updateMany({}, { $inc: { tokenVersion: 1 } })
    res.status(200).json({ shutdown: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'No se pudo apagar la aplicación' })
  }
}

export const requestSupport = async (req, res) => {
  const username = String(req.body?.username || '').trim()
  if (!username) {
    return res.status(400).json({ message: 'El usuario es requerido' })
  }
  try {
    const user = await UserModel.findOne({ username }).populate('role', 'name')
    res.status(200).json({ allowed: isSudo(user?.role?.name) })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'No se pudo consultar el soporte' })
  }
}

export const startupApp = async (req, res) => {
  try {
    await setShutdown(false)
    res.status(200).json({ shutdown: false })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'No se pudo activar la aplicación' })
  }
}
