/**
 * Application power switch.
 * Mongo stores `active`. Every status response also sends `shutdown` for clients
 * that already branch on that field. Both describe the same fact.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import UserModel from '../models/users.model.js'
import {
  isApplicationActive,
  setApplicationActive
} from '../models/appState.model.js'

const codesMatch = (left, right) =>
  timingSafeEqual(
    createHash('sha256').update(left).digest(),
    createHash('sha256').update(right).digest()
  )

const applicationStatus = () => {
  const active = isApplicationActive()
  return { active, shutdown: active === false }
}

export const getAppStatus = (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  res.status(200).json(applicationStatus())
}

export const shutdownApp = async (req, res) => {
  try {
    await setApplicationActive(false)
    await UserModel.updateMany({}, { $inc: { tokenVersion: 1 } })
    res.status(200).json(applicationStatus())
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'No se pudo apagar la aplicación' })
  }
}

export const requestSupport = (req, res) => {
  const code = String(req.body?.code || '').trim()
  if (!code) {
    return res.status(400).json({ message: 'El código es requerido' })
  }
  const expected = String(process.env.RAILWAY_ACTIVATE || '').trim()
  if (!expected) {
    return res.status(500).json({ message: 'No se pudo consultar el soporte' })
  }
  res.status(200).json({ allowed: codesMatch(code, expected) })
}

export const startupApp = async (req, res) => {
  try {
    await setApplicationActive(true)
    res.status(200).json(applicationStatus())
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'No se pudo activar la aplicación' })
  }
}
