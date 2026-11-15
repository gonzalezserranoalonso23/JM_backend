import { describe, expect, it } from 'vitest'

import CategoriesRouter from '../src/routes/categories.routes.js'
import DailyInformationRouter from '../src/routes/dailyInformation.routes.js'
import InventoryRecordRouter from '../src/routes/inventoryRecords.routes.js'
import OrdersRouter from '../src/routes/orders.routes.js'
import PaymentTypeRouter from '../src/routes/paymentTypes.routes.js'
import ProductsRouter from '../src/routes/products.routes.js'
import SuppliersRouter from '../src/routes/suppliers.routes.js'
import TasksRouter from '../src/routes/tasks.routes.js'
import TypeInventoryRouter from '../src/routes/typeInventory.routes.js'
import UsersRouter from '../src/routes/users.routes.js'
import PushNotificationsRouter from '../src/routes/pushNotifications.routes.js'
import DenominationsRouter from '../src/routes/denominations.routes.js'
import AttendanceRouter from '../src/routes/attendance.routes.js'
import RolesRouter from '../src/routes/roles.routes.js'

const getRoutes = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      method: Object.keys(layer.route.methods)[0].toUpperCase(),
      path: layer.route.path
    }))

describe('Route registration smoke tests', () => {
  it('declares all users routes', () => {
    expect(getRoutes(UsersRouter)).toEqual(
      expect.arrayContaining([
        { method: 'POST', path: '/login' },
        { method: 'POST', path: '/logout' },
        { method: 'POST', path: '/:id/logout' },
        { method: 'POST', path: '/register' },
        { method: 'GET', path: '/assignable' },
        { method: 'GET', path: '/me' },
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all product routes', () => {
    expect(getRoutes(ProductsRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/promotions' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all inventory routes', () => {
    expect(getRoutes(InventoryRecordRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/liveInformation' },
        { method: 'GET', path: '/reports/daily-summary' },
        { method: 'GET', path: '/reports/low-stock' },
        { method: 'GET', path: '/reports/date-range' },
        { method: 'GET', path: '/reports/by-type' },
        { method: 'GET', path: '/reports/stats' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all category routes', () => {
    expect(getRoutes(CategoriesRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all supplier routes', () => {
    expect(getRoutes(SuppliersRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all type inventory routes', () => {
    expect(getRoutes(TypeInventoryRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all payment type routes', () => {
    expect(getRoutes(PaymentTypeRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all daily information routes', () => {
    expect(getRoutes(DailyInformationRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all order routes', () => {
    expect(getRoutes(OrdersRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })

  it('declares all push notification routes', () => {
    expect(getRoutes(PushNotificationsRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/vapid-public-key' },
        { method: 'POST', path: '/subscribe' },
        { method: 'DELETE', path: '/subscribe' }
      ])
    )
  })

  it('declares all denomination routes', () => {
    expect(getRoutes(DenominationsRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'POST', path: '/open' },
        { method: 'PUT', path: '/' }
      ])
    )
  })

  it('declares all role routes', () => {
    expect(getRoutes(RolesRouter)).toEqual([
      { method: 'GET', path: '/' },
      { method: 'GET', path: '/:id' },
      { method: 'POST', path: '/' },
      { method: 'PUT', path: '/:id' },
      { method: 'DELETE', path: '/:id' }
    ])
  })

  it('declares all attendance routes', () => {
    expect(getRoutes(AttendanceRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/me' },
        { method: 'GET', path: '/' },
        { method: 'POST', path: '/check-in' },
        { method: 'POST', path: '/check-out' }
      ])
    )
  })

  it('declares all task routes', () => {
    expect(getRoutes(TasksRouter)).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/pending' },
        { method: 'GET', path: '/completed' },
        { method: 'GET', path: '/:id' },
        { method: 'POST', path: '/' },
        { method: 'PUT', path: '/:id' },
        { method: 'DELETE', path: '/:id' }
      ])
    )
  })
})
