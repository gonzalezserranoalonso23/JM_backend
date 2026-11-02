/**
 * Asistencia del personal (no administradores).
 * Base: /api/attendance (requiere token)
 *
 * GET  /me         -> getMyAttendance     turnos propios, 10 por página. query: page, from, to (YYYY-MM-DD)
 * GET  /           -> getAttendanceDay    query: date (YYYY-MM-DD) | solo admin
 * POST /check-in   -> checkIn             body: { latitude, longitude } | quien tiene horario, en su día y en el lugar
 * POST /check-out  -> checkOut            cierra la entrada abierta | quien tiene horario, exige una entrada
 */
import Attendance from './attendance.model.js'
import User from '../users/users.model.js'

const CLIENT_DATE = /^\d{4}-\d{2}-\d{2}$/
const USER_FIELDS = 'username fullName'
const DEFAULT_RADIUS_METERS = 150

export const mexicoCityDate = (instant = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant)
  const value = (type) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export const mexicoCityWeekday = (instant = new Date()) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    weekday: 'long'
  })
    .format(instant)
    .toLowerCase()

const worksToday = (user, instant = new Date()) =>
  user?.haveSchedule === true &&
  user.schedule?.[mexicoCityWeekday(instant)]?.enabled === true

const readNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const distanceMeters = (fromLat, fromLng, toLat, toLng) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const earth = 6371000
  const latitudeDelta = toRadians(toLat - fromLat)
  const longitudeDelta = toRadians(toLng - fromLng)
  const chord =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 2 * earth * Math.asin(Math.sqrt(chord))
}

const workplace = () => {
  const latitude = readNumber(process.env.WORKPLACE_LATITUDE)
  const longitude = readNumber(process.env.WORKPLACE_LONGITUDE)
  const radius =
    readNumber(process.env.WORKPLACE_RADIUS_METERS) ?? DEFAULT_RADIUS_METERS
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    radius <= 0
  ) {
    return null
  }
  return { latitude, longitude, radius }
}

const canPunch = (req, user, res) => {
  if (!req.isAdmin || user?.haveSchedule === true) return true
  res.status(403).json({
    message: 'La asistencia es para el personal, no para administradores'
  })
  return false
}

const RECORD_PAGE_SIZE = 10

const readRecordPage = (query = {}) => {
  const page = Number(query.page ?? 1)
  if (!Number.isInteger(page) || page < 1) {
    return { error: 'La página debe ser un entero mayor que cero' }
  }
  const from = String(query.from || '').trim()
  const to = String(query.to || '').trim()
  if ((from && !CLIENT_DATE.test(from)) || (to && !CLIENT_DATE.test(to))) {
    return { error: 'La fecha debe tener formato YYYY-MM-DD' }
  }
  if (from && to && from > to) {
    return { error: 'La fecha inicial no puede ser posterior a la final' }
  }
  return { page, from, to }
}

const getMyAttendance = async (req, res) => {
  const paging = readRecordPage(req.query)
  if (paging.error) {
    return res.status(400).json({ message: paging.error })
  }
  const filter = { user: req.userId }
  if (paging.from || paging.to) {
    filter.date = {}
    if (paging.from) filter.date.$gte = paging.from
    if (paging.to) filter.date.$lte = paging.to
  }
  try {
    const [records, total, open, user] = await Promise.all([
      Attendance.find(filter)
        .sort({ checkInAt: -1 })
        .skip((paging.page - 1) * RECORD_PAGE_SIZE)
        .limit(RECORD_PAGE_SIZE)
        .lean(),
      Attendance.countDocuments(filter),
      Attendance.findOne({ user: req.userId, checkOutAt: null }).lean(),
      User.findById(req.userId).select('haveSchedule schedule').lean()
    ])
    res.status(200).json({
      records,
      open,
      workDay: worksToday(user),
      page: paging.page,
      limit: RECORD_PAGE_SIZE,
      total,
      hasNextPage: paging.page * RECORD_PAGE_SIZE < total
    })
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar la asistencia',
      error: error.message
    })
  }
}

const getAttendanceDay = async (req, res) => {
  if (!req.isAdmin) {
    return res
      .status(403)
      .json({ message: 'Acceso solo para administradores' })
  }
  const date = String(req.query?.date || '').trim()
  if (!CLIENT_DATE.test(date)) {
    return res
      .status(400)
      .json({ message: 'La fecha es requerida con formato YYYY-MM-DD' })
  }
  try {
    const [staff, records] = await Promise.all([
      User.find({
        $or: [{ isAdmin: { $ne: true } }, { haveSchedule: true }]
      })
        .select(USER_FIELDS)
        .sort({ username: 1 })
        .lean(),
      Attendance.find({ date })
        .populate('user', USER_FIELDS)
        .sort({ checkInAt: 1 })
        .lean()
    ])
    res.status(200).json({ date, staff, records })
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar la asistencia del día',
      error: error.message
    })
  }
}

const checkIn = async (req, res) => {
  let user
  try {
    user = await User.findById(req.userId)
      .select('haveSchedule schedule')
      .lean()
    if (!canPunch(req, user, res)) return
    if (!worksToday(user)) {
      return res.status(403).json({ message: 'Hoy no es tu día de trabajo' })
    }
  } catch (error) {
    return res.status(500).json({
      message: 'Error al registrar la entrada',
      error: error.message
    })
  }
  const latitude = readNumber(req.body?.latitude)
  const longitude = readNumber(req.body?.longitude)
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      message: 'Se necesita tu ubicación para registrar la entrada'
    })
  }
  const place = workplace()
  if (!place) {
    return res.status(503).json({
      message: 'El lugar de trabajo no está configurado'
    })
  }
  if (
    distanceMeters(latitude, longitude, place.latitude, place.longitude) >
    place.radius
  ) {
    return res.status(403).json({
      message: 'Tienes que estar en el lugar de trabajo para registrar la entrada'
    })
  }
  try {
    const open = await Attendance.findOne({
      user: req.userId,
      checkOutAt: null
    }).lean()
    if (open) {
      return res.status(409).json({
        message: 'Ya tienes una entrada abierta. Registra la salida primero.'
      })
    }
    const record = await Attendance.create({
      user: req.userId,
      date: mexicoCityDate(),
      checkInAt: new Date(),
      latitude,
      longitude,
      checkOutAt: null
    })
    res.status(201).json(record)
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: 'Ya tienes una entrada abierta. Registra la salida primero.'
      })
    }
    res.status(500).json({
      message: 'Error al registrar la entrada',
      error: error.message
    })
  }
}

const checkOut = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('haveSchedule').lean()
    if (!canPunch(req, user, res)) return
    const record = await Attendance.findOneAndUpdate(
      { user: req.userId, checkOutAt: null },
      { $set: { checkOutAt: new Date() } },
      { returnDocument: 'after', sort: { checkInAt: -1 } }
    )
    if (!record) {
      return res.status(400).json({
        message: 'No tienes una entrada abierta'
      })
    }
    res.status(200).json(record)
  } catch (error) {
    res.status(500).json({
      message: 'Error al registrar la salida',
      error: error.message
    })
  }
}

export { getMyAttendance, getAttendanceDay, checkIn, checkOut }
