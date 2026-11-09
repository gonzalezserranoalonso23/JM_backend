import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mexicoCityDate,
  mexicoCityWeekday
} from '../src/modules/attendance/attendance.controller.js'

const users = { rows: [] }

vi.mock('../src/modules/users/users.model.js', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({
        lean: async () => users.rows
      })
    }))
  }
}))

vi.mock('../src/modules/attendance/attendance.model.js', () => ({
  default: { exists: vi.fn() }
}))

vi.mock(
  '../src/modules/push-notifications/push-notifications.model.js',
  () => ({
    default: { exists: vi.fn() }
  })
)

vi.mock('../src/modules/push-notifications/push.service.js', () => ({
  sendPushToUser: vi.fn()
}))

vi.mock('../src/modules/attendance/shift-reminder.model.js', () => ({
  default: {
    create: vi.fn(),
    deleteOne: vi.fn()
  }
}))

const { default: Attendance } =
  await import('../src/modules/attendance/attendance.model.js')
const { default: PushSubscription } =
  await import('../src/modules/push-notifications/push-notifications.model.js')
const { sendPushToUser } =
  await import('../src/modules/push-notifications/push.service.js')
const { default: ShiftReminder } =
  await import('../src/modules/attendance/shift-reminder.model.js')
const { isShiftReminderDue, minutesFromClock, remindDueShifts } =
  await import('../src/modules/attendance/shiftReminder.js')

const offsetMinutes = (instant) => {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    timeZoneName: 'shortOffset'
  })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name || '')
  if (!match) throw new Error(`Zona desconocida: ${name}`)
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0))
}

const atMexico = (date, time) => {
  const guess = new Date(`${date}T${time}:00.000Z`)
  return new Date(guess.getTime() - offsetMinutes(guess) * 60 * 1000)
}

const scheduledUser = (instant, start, enabled = true) => ({
  _id: 'user-1',
  schedule: {
    [mexicoCityWeekday(instant)]: {
      enabled,
      start,
      end: '18:00'
    }
  }
})

describe('aviso de entrada', () => {
  it('está dentro de los 10 minutos previos a la entrada', () => {
    const start = minutesFromClock('09:00')
    expect(isShiftReminderDue(minutesFromClock('08:50'), start)).toBe(true)
    expect(isShiftReminderDue(minutesFromClock('08:59'), start)).toBe(true)
    expect(isShiftReminderDue(minutesFromClock('08:49'), start)).toBe(false)
    expect(isShiftReminderDue(minutesFromClock('09:00'), start)).toBe(false)
    expect(isShiftReminderDue(minutesFromClock('09:10'), start)).toBe(false)
    expect(minutesFromClock('25:00')).toBeNull()
  })

  describe('envío', () => {
    const instant = atMexico('2026-06-15', '09:50')

    beforeEach(() => {
      users.rows = [scheduledUser(instant, '10:00')]
      Attendance.exists.mockReset().mockResolvedValue(null)
      PushSubscription.exists.mockReset().mockResolvedValue({ _id: 'sub' })
      sendPushToUser.mockReset().mockResolvedValue(undefined)
      ShiftReminder.create.mockReset().mockResolvedValue({ _id: 'reminder' })
      ShiftReminder.deleteOne.mockReset().mockResolvedValue({ deletedCount: 1 })
    })

    it('avisa una vez a quien tiene horario y notificaciones', async () => {
      await remindDueShifts(instant)

      expect(sendPushToUser).toHaveBeenCalledWith('user-1', {
        title: 'Tu entrada',
        body: 'En 10 minutos empieza tu turno. Registra tu entrada.',
        url: '/home',
        tag: `shift-reminder-${mexicoCityDate(instant)}`
      })

      ShiftReminder.create.mockRejectedValueOnce(
        Object.assign(new Error('dup'), { code: 11000 })
      )
      await remindDueShifts(instant)
      expect(sendPushToUser).toHaveBeenCalledTimes(1)
    })

    it('no avisa si ya checó, no tiene notificaciones o no trabaja hoy', async () => {
      Attendance.exists.mockResolvedValue({ _id: 'open' })
      await remindDueShifts(instant)
      expect(sendPushToUser).not.toHaveBeenCalled()

      Attendance.exists.mockResolvedValue(null)
      PushSubscription.exists.mockResolvedValue(null)
      await remindDueShifts(instant)
      expect(ShiftReminder.create).not.toHaveBeenCalled()

      users.rows = [scheduledUser(instant, '10:00', false)]
      PushSubscription.exists.mockResolvedValue({ _id: 'sub' })
      await remindDueShifts(instant)
      expect(sendPushToUser).not.toHaveBeenCalled()
    })

    it('libera el aviso si el envío falla para reintentarlo', async () => {
      sendPushToUser.mockRejectedValue(new Error('push caído'))
      await remindDueShifts(instant)
      expect(ShiftReminder.deleteOne).toHaveBeenCalledWith({
        user: 'user-1',
        date: mexicoCityDate(instant)
      })
    })
  })
})
