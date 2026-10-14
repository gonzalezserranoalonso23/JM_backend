import { describe, expect, it } from 'vitest'

import CategoriesRouter from '../src/modules/categories/categories.routes.js'
import DailyInformationRouter from '../src/modules/daily-information/daily-information.routes.js'
import InventoryRecordRouter from '../src/modules/inventory-records/inventory-records.routes.js'
import OrdersRouter from '../src/modules/orders/orders.routes.js'
import PaymentTypeRouter from '../src/modules/payment-types/payment-types.routes.js'
import ProductsRouter from '../src/modules/products/products.routes.js'
import SuppliersRouter from '../src/modules/suppliers/suppliers.routes.js'
import TasksRouter from '../src/modules/tasks/tasks.routes.js'
import TypeInventoryRouter from '../src/modules/type-inventory/type-inventory.routes.js'
import UsersRouter from '../src/modules/users/users.routes.js'

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
        { method: 'POST', path: '/register' },
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
