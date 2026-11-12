/**
 * Staff attendance. Base: /api/attendance (token)
 *
 * GET  /me        query { page, from, to } -> own shifts, 10 per page
 * GET  /          query { date } -> day roster, full access only
 * POST /check-in  { latitude, longitude, cashReceived } -> open a shift at the workplace
 * POST /check-out { latitude, longitude, cashCut, supplierPayments } -> close the open shift
 */
import { isValidObjectId } from 'mongoose'
import Attendance from './attendance.model.js'
import User from '../users/users.model.js'
import Supplier from '../suppliers/suppliers.model.js'
import { grantsFullAccess } from '../roles/roles.model.js'
import { roundMoney } from '../../utils/money.js'

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

const weekdayOfClientDate = (date) =>
  mexicoCityWeekday(new Date(`${date}T12:00:00-06:00`))

const worksToday = (user, instant = new Date()) =>
  user?.haveSchedule === true &&
  user.schedule?.[mexicoCityWeekday(instant)]?.enabled === true

const worksOnDate = (user, date) =>
  user?.schedule?.[weekdayOfClientDate(date)]?.enabled === true

const SUPPLIER_FIELDS = 'suppliersName'

const readPayments = async (value) => {
  if (value == null || value === '') return { payments: [] }
  if (!Array.isArray(value)) {
    return { error: 'Los pagos a proveedores tienen que ser una lista' }
  }
  const payments = []
  for (const item of value) {
    const { supplier, amount: rawAmount } = item ?? {}
    if (!isValidObjectId(supplier)) {
      return { error: 'Elige un proveedor' }
    }
    const amount = readCash(rawAmount)
    if (amount === null) {
      return { error: 'Indica la cantidad pagada al proveedor' }
    }
    payments.push({ supplier, amount })
  }
  if (payments.length === 0) return { payments }
  const found = await Supplier.find({
    _id: { $in: payments.map((payment) => payment.supplier) }
  })
    .select('_id')
    .lean()
  const ids = new Set(found.map((supplier) => String(supplier._id)))
  if (payments.some((payment) => !ids.has(String(payment.supplier)))) {
    return { error: 'El proveedor no existe' }
  }
  return { payments }
}

const readCash = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null
  }
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return roundMoney(number)
}

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

const requireWorkplace = (
  { latitude: rawLatitude, longitude: rawLongitude },
  res,
  action
) => {
  const latitude = readNumber(rawLatitude)
  const longitude = readNumber(rawLongitude)
  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    res.status(400).json({
      message: `Se necesita tu ubicación para registrar la ${action}`
    })
    return null
  }
  const place = workplace()
  if (!place) {
    res.status(503).json({
      message: 'El lugar de trabajo no está configurado'
    })
    return null
  }
  if (
    distanceMeters(latitude, longitude, place.latitude, place.longitude) >
    place.radius
  ) {
    res.status(403).json({
      message: `Tienes que estar en el lugar de trabajo para registrar la ${action}`
    })
    return null
  }
  return { latitude, longitude }
}

const canPunch = (req, user, res) => {
  if (!grantsFullAccess(req.role) || user?.haveSchedule === true) return true
  res.status(403).json({
    message: 'La asistencia es para el personal, no para administradores'
  })
  return false
}

const RECORD_PAGE_SIZE = 10

const readRecordPage = (query = {}) => {
  const { page: rawPage = 1, from: rawFrom = '', to: rawTo = '' } = query
  const page = Number(rawPage)
  if (!Number.isInteger(page) || page < 1) {
    return { error: 'La página debe ser un entero mayor que cero' }
  }
  const from = String(rawFrom).trim()
  const to = String(rawTo).trim()
  if ((from && !CLIENT_DATE.test(from)) || (to && !CLIENT_DATE.test(to))) {
    return { error: 'La fecha debe tener formato YYYY-MM-DD' }
  }
  if (from && to && from > to) {
    return { error: 'La fecha inicial no puede ser posterior a la final' }
  }
  return { page, from, to }
}

const getMyAttendance = async (req, res) => {
  const { query = {} } = req
  const paging = readRecordPage(query)
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
        .populate('supplierPayments.supplier', SUPPLIER_FIELDS)
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
  const { role, query = {} } = req
  const { date: rawDate = '' } = query
  if (!grantsFullAccess(role)) {
    return res.status(403).json({ message: 'Acceso solo para administradores' })
  }
  const date = String(rawDate).trim()
  if (!CLIENT_DATE.test(date)) {
    return res
      .status(400)
      .json({ message: 'La fecha es requerida con formato YYYY-MM-DD' })
  }
  try {
    const [staff, records] = await Promise.all([
      User.find({ haveSchedule: true })
        .select(`${USER_FIELDS} schedule`)
        .sort({ username: 1 })
        .lean(),
      Attendance.find({ date })
        .populate('user', USER_FIELDS)
        .populate('supplierPayments.supplier', SUPPLIER_FIELDS)
        .sort({ checkInAt: 1 })
        .lean()
    ])
    const present = new Set(
      records.map((record) => String(record.user?._id || ''))
    )
    const working = staff
      .filter(
        (user) => worksOnDate(user, date) || present.has(String(user._id))
      )
      .map(({ _id, username, fullName }) => ({ _id, username, fullName }))
    res.status(200).json({ date, staff: working, records })
  } catch (error) {
    res.status(500).json({
      message: 'Error al cargar la asistencia del día',
      error: error.message
    })
  }
}

const checkIn = async (req, res) => {
  const { body = {} } = req
  const { latitude, longitude, cashReceived: received } = body
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
  const position = requireWorkplace({ latitude, longitude }, res, 'entrada')
  if (!position) return
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
    const cashReceived = readCash(received)
    if (cashReceived === null) {
      return res.status(400).json({
        message: 'Indica lo que recibes en caja'
      })
    }
    const record = await Attendance.create({
      user: req.userId,
      date: mexicoCityDate(),
      checkInAt: new Date(),
      latitude: position.latitude,
      longitude: position.longitude,
      checkOutAt: null,
      cashReceived
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
  const { body = {} } = req
  const {
    latitude,
    longitude,
    cashCut: rawCut,
    supplierPayments
  } = body
  try {
    const user = await User.findById(req.userId).select('haveSchedule').lean()
    if (!canPunch(req, user, res)) return
    const open = await Attendance.findOne({
      user: req.userId,
      checkOutAt: null
    }).lean()
    if (!open) {
      return res.status(400).json({
        message: 'No tienes una entrada abierta'
      })
    }
    if (!requireWorkplace({ latitude, longitude }, res, 'salida')) return
    const cashCut = readCash(rawCut)
    if (cashCut === null) {
      return res.status(400).json({
        message: 'Indica el dinero de tu corte'
      })
    }
    const payments = await readPayments(supplierPayments)
    if (payments.error) {
      return res.status(400).json({ message: payments.error })
    }
    const record = await Attendance.findOneAndUpdate(
      { user: req.userId, checkOutAt: null },
      {
        $set: {
          checkOutAt: new Date(),
          cashCut,
          supplierPayments: payments.payments
        }
      },
      { returnDocument: 'after', sort: { checkInAt: -1 } }
    ).populate('supplierPayments.supplier', SUPPLIER_FIELDS)
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
