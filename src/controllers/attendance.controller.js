/**
 * Staff attendance. Base: /api/attendance (token)
 */
import {
  checkInUser,
  checkOutUser,
  getAttendanceDayData,
  getMyAttendanceData,
  mexicoCityDate,
  mexicoCityWeekday
} from '../services/attendance.service.js'

export { mexicoCityDate, mexicoCityWeekday }

const sendError = (res, error, fallback) => {
  if (!error.status) console.error(error)
  res.status(error.status || 500).json({
    message: error.status ? error.message : fallback
  })
}

const getMyAttendance = async (req, res) => {
  try {
    const data = await getMyAttendanceData(req.userId, req.query)
    res.status(200).json(data)
  } catch (error) {
    sendError(res, error, 'Error al cargar la asistencia')
  }
}

const getAttendanceDay = async (req, res) => {
  try {
    const date = String(req.query?.date || '').trim()
    const data = await getAttendanceDayData(req.role, date)
    res.status(200).json(data)
  } catch (error) {
    sendError(res, error, 'Error al cargar la asistencia del día')
  }
}

const checkIn = async (req, res) => {
  try {
    const record = await checkInUser({
      userId: req.userId,
      role: req.role,
      body: req.body || {}
    })
    res.status(201).json(record)
  } catch (error) {
    sendError(res, error, 'Error al registrar la entrada')
  }
}

const checkOut = async (req, res) => {
  try {
    const record = await checkOutUser({
      userId: req.userId,
      role: req.role,
      body: req.body || {}
    })
    res.status(200).json(record)
  } catch (error) {
    sendError(res, error, 'Error al registrar la salida')
  }
}

export { getMyAttendance, getAttendanceDay, checkIn, checkOut }
