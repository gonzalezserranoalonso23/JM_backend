/**
 * Notify 10 minutes before a scheduled shift. Mexico City time.
 * One notice per person per day, only if push was accepted and they are not checked in.
 */
import Attendance from './attendance.model.js'
import ShiftReminder from './shift-reminder.model.js'
import User from '../users/users.model.js'
import PushSubscription from '../push-notifications/push-notifications.model.js'
import { sendPushToUser } from '../push-notifications/push.service.js'
import { mexicoCityDate, mexicoCityWeekday } from './attendance.controller.js'

const LEAD_MINUTES = 10
const MINUTE = 60 * 1000
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

export const minutesFromClock = (value) => {
  const match = CLOCK.exec(String(value || '').trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export const isShiftReminderDue = (
  nowMinutes,
  startMinutes,
  lead = LEAD_MINUTES
) => {
  if (!Number.isInteger(nowMinutes) || !Number.isInteger(startMinutes)) {
    return false
  }
  if (startMinutes < 0 || startMinutes >= 24 * 60) return false
  if (nowMinutes < 0 || nowMinutes >= 24 * 60) return false
  const reminderAt = startMinutes - lead
  if (reminderAt < 0) return nowMinutes < startMinutes
  return nowMinutes >= reminderAt && nowMinutes < startMinutes
}

const mexicoCityMinutes = (instant) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant)
  const value = (type) => parts.find((part) => part.type === type)?.value
  let hour = Number(value('hour'))
  const minute = Number(value('minute'))
  if (hour === 24) hour = 0
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  return hour * 60 + minute
}

const reminderBody = (remaining) => {
  const minutes = remaining === 1 ? '1 minuto' : `${remaining} minutos`
  return `En ${minutes} empieza tu turno. Registra tu entrada.`
}

export const remindDueShifts = async (instant = new Date()) => {
  const nowMinutes = mexicoCityMinutes(instant)
  if (nowMinutes === null) return
  const date = mexicoCityDate(instant)
  const weekday = mexicoCityWeekday(instant)
  const users = await User.find({ haveSchedule: true })
    .select('schedule')
    .lean()

  for (const user of users) {
    const shift = user.schedule?.[weekday]
    if (!shift?.enabled) continue
    const startMinutes = minutesFromClock(shift.start)
    if (!isShiftReminderDue(nowMinutes, startMinutes)) continue
    const remaining = startMinutes - nowMinutes
    if (remaining <= 0) continue

    const already = await Attendance.exists({
      user: user._id,
      $or: [{ date }, { checkOutAt: null }]
    })
    if (already) continue

    const subscribed = await PushSubscription.exists({ user: user._id })
    if (!subscribed) continue

    try {
      await ShiftReminder.create({ user: user._id, date })
    } catch (error) {
      if (error?.code === 11000) continue
      console.error(`No se pudo reservar el aviso de entrada: ${error.message}`)
      continue
    }

    try {
      await sendPushToUser(String(user._id), {
        title: 'Tu entrada',
        body: reminderBody(remaining),
        url: '/home',
        tag: `shift-reminder-${date}`
      })
    } catch (error) {
      await ShiftReminder.deleteOne({ user: user._id, date })
      console.error(`No se pudo avisar la entrada: ${error.message}`)
    }
  }
}

export const startShiftReminders = () => {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await remindDueShifts()
    } catch (error) {
      console.error(
        `No se pudieron revisar los avisos de entrada: ${error.message}`
      )
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, MINUTE)
  timer.unref?.()
  tick()
  return () => clearInterval(timer)
}
