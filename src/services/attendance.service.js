import { isValidObjectId } from 'mongoose'
import Attendance from '../models/attendance.model.js'
import User from '../models/users.model.js'
import Supplier from '../models/suppliers.model.js'
import { findSudoRoleId, grantsFullAccess, isSudo } from '../models/roles.model.js'
import { roundMoney } from '../utils/money.js'

export const CLIENT_DATE = /^\d{4}-\d{2}-\d{2}$/
export const USER_FIELDS = 'username fullName'
export const SUPPLIER_FIELDS = 'suppliersName'
export const RECORD_PAGE_SIZE = 10
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

export const worksToday = (user, instant = new Date()) =>
  user?.haveSchedule === true &&
  user.schedule?.[mexicoCityWeekday(instant)]?.enabled === true

export const worksOnDate = (user, date) =>
  user?.schedule?.[weekdayOfClientDate(date)]?.enabled === true

export const readCash = (value) => {
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

export const resolveWorkplacePosition = (
  { latitude: rawLatitude, longitude: rawLongitude },
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
    const error = new Error(`Se necesita tu ubicación para registrar la ${action}`)
    error.status = 400
    throw error
  }
  const place = workplace()
  if (!place) {
    const error = new Error('El lugar de trabajo no está configurado')
    error.status = 503
    throw error
  }
  if (
    distanceMeters(latitude, longitude, place.latitude, place.longitude) >
    place.radius
  ) {
    const error = new Error(
      `Tienes que estar en el lugar de trabajo para registrar la ${action}`
    )
    error.status = 403
    throw error
  }
  return { latitude, longitude }
}

export const canPunch = (role, user) => {
  if (!grantsFullAccess(role) || user?.haveSchedule === true) return true
  const error = new Error('La asistencia es para el personal, no para administradores')
  error.status = 403
  throw error
}

export const readPayments = async (value) => {
  if (value == null || value === '') return []
  if (!Array.isArray(value)) {
    const error = new Error('Los pagos a proveedores tienen que ser una lista')
    error.status = 400
    throw error
  }
  const payments = []
  for (const item of value) {
    const { supplier, amount: rawAmount } = item ?? {}
    if (!isValidObjectId(supplier)) {
      const error = new Error('Elige un proveedor')
      error.status = 400
      throw error
    }
    const amount = readCash(rawAmount)
    if (amount === null) {
      const error = new Error('Indica la cantidad pagada al proveedor')
      error.status = 400
      throw error
    }
    payments.push({ supplier, amount })
  }
  if (payments.length === 0) return []
  const found = await Supplier.find({
    _id: { $in: payments.map((payment) => payment.supplier) }
  })
    .select('_id')
    .lean()
  const ids = new Set(found.map((supplier) => String(supplier._id)))
  if (payments.some((payment) => !ids.has(String(payment.supplier)))) {
    const error = new Error('El proveedor no existe')
    error.status = 400
    throw error
  }
  return payments
}

export const readRecordPage = (query = {}) => {
  const { page: rawPage = 1, from: rawFrom = '', to: rawTo = '' } = query
  const page = Number(rawPage)
  if (!Number.isInteger(page) || page < 1) {
    const error = new Error('La página debe ser un entero mayor que cero')
    error.status = 400
    throw error
  }
  const from = String(rawFrom).trim()
  const to = String(rawTo).trim()
  if ((from && !CLIENT_DATE.test(from)) || (to && !CLIENT_DATE.test(to))) {
    const error = new Error('La fecha debe tener formato YYYY-MM-DD')
    error.status = 400
    throw error
  }
  if (from && to && from > to) {
    const error = new Error('La fecha inicial no puede ser posterior a la final')
    error.status = 400
    throw error
  }
  return { page, from, to }
}

export const getMyAttendanceData = async (userId, query = {}) => {
  const paging = readRecordPage(query)
  const filter = { user: userId }
  if (paging.from || paging.to) {
    filter.date = {}
    if (paging.from) filter.date.$gte = paging.from
    if (paging.to) filter.date.$lte = paging.to
  }

  const [records, total, open, user] = await Promise.all([
    Attendance.find(filter)
      .populate('supplierPayments.supplier', SUPPLIER_FIELDS)
      .sort({ checkInAt: -1 })
      .skip((paging.page - 1) * RECORD_PAGE_SIZE)
      .limit(RECORD_PAGE_SIZE)
      .lean(),
    Attendance.countDocuments(filter),
    Attendance.findOne({ user: userId, checkOutAt: null }).lean(),
    User.findById(userId).select('haveSchedule schedule').lean()
  ])

  return {
    records,
    open,
    workDay: worksToday(user),
    page: paging.page,
    limit: RECORD_PAGE_SIZE,
    total,
    hasNextPage: paging.page * RECORD_PAGE_SIZE < total
  }
}

export const getAttendanceDayData = async (role, date) => {
  if (!grantsFullAccess(role)) {
    const error = new Error('Acceso solo para administradores')
    error.status = 403
    throw error
  }
  if (!CLIENT_DATE.test(date)) {
    const error = new Error('La fecha es requerida con formato YYYY-MM-DD')
    error.status = 400
    throw error
  }

  const sudoId = isSudo(role) ? null : await findSudoRoleId()
  const hiddenIds = sudoId
    ? (await User.find({ role: sudoId }).select('_id').lean()).map((u) => u._id)
    : []

  const [staff, records] = await Promise.all([
    User.find({
      haveSchedule: true,
      ...(sudoId ? { role: { $ne: sudoId } } : {})
    })
      .select(`${USER_FIELDS} schedule`)
      .sort({ username: 1 })
      .lean(),
    Attendance.find({
      date,
      ...(hiddenIds.length ? { user: { $nin: hiddenIds } } : {})
    })
      .populate('user', USER_FIELDS)
      .populate('supplierPayments.supplier', SUPPLIER_FIELDS)
      .sort({ checkInAt: 1 })
      .lean()
  ])

  const present = new Set(records.map((record) => String(record.user?._id || '')))
  const working = staff
    .filter((user) => worksOnDate(user, date) || present.has(String(user._id)))
    .map(({ _id, username, fullName }) => ({ _id, username, fullName }))

  return { date, staff: working, records }
}

export const checkInUser = async ({ userId, role, body = {} }) => {
  const user = await User.findById(userId).select('haveSchedule schedule').lean()
  canPunch(role, user)
  if (!worksToday(user)) {
    const error = new Error('Hoy no es tu día de trabajo')
    error.status = 403
    throw error
  }

  const position = resolveWorkplacePosition(body, 'entrada')
  const open = await Attendance.findOne({ user: userId, checkOutAt: null }).lean()
  if (open) {
    const error = new Error('Ya tienes una entrada abierta. Registra la salida primero.')
    error.status = 409
    throw error
  }

  const cashReceived = readCash(body.cashReceived)
  if (cashReceived === null) {
    const error = new Error('Indica lo que recibes en caja')
    error.status = 400
    throw error
  }

  try {
    return await Attendance.create({
      user: userId,
      date: mexicoCityDate(),
      checkInAt: new Date(),
      latitude: position.latitude,
      longitude: position.longitude,
      checkOutAt: null,
      cashReceived
    })
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error(
        'Ya tienes una entrada abierta. Registra la salida primero.'
      )
      conflict.status = 409
      throw conflict
    }
    throw error
  }
}

export const checkOutUser = async ({ userId, role, body = {} }) => {
  const user = await User.findById(userId).select('haveSchedule').lean()
  canPunch(role, user)

  const open = await Attendance.findOne({ user: userId, checkOutAt: null }).lean()
  if (!open) {
    const error = new Error('No tienes una entrada abierta')
    error.status = 400
    throw error
  }

  resolveWorkplacePosition(body, 'salida')
  const cashCut = readCash(body.cashCut)
  if (cashCut === null) {
    const error = new Error('Indica el dinero de tu corte')
    error.status = 400
    throw error
  }

  const payments = await readPayments(body.supplierPayments)
  const record = await Attendance.findOneAndUpdate(
    { user: userId, checkOutAt: null },
    {
      $set: {
        checkOutAt: new Date(),
        cashCut,
        supplierPayments: payments
      }
    },
    { returnDocument: 'after', sort: { checkInAt: -1 } }
  )
    .populate('supplierPayments.supplier', SUPPLIER_FIELDS)
    .lean()

  if (!record) {
    const error = new Error('No tienes una entrada abierta')
    error.status = 400
    throw error
  }
  return record
}
