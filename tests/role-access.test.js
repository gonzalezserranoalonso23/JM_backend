import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'
import usersRouter from '../src/modules/users/users.routes.js'
import typeInventoryRouter from '../src/modules/type-inventory/type-inventory.routes.js'
import paymentTypesRouter from '../src/modules/payment-types/payment-types.routes.js'
import categoriesRouter from '../src/modules/categories/categories.routes.js'
import suppliersRouter from '../src/modules/suppliers/suppliers.routes.js'
import productsRouter from '../src/modules/products/products.routes.js'
import inventoryRecordsRouter from '../src/modules/inventory-records/inventory-records.routes.js'
import dailyInformationRouter from '../src/modules/daily-information/daily-information.routes.js'
import ordersRouter from '../src/modules/orders/orders.routes.js'
import tasksRouter from '../src/modules/tasks/tasks.routes.js'
import pushNotificationsRouter from '../src/modules/push-notifications/push-notifications.routes.js'
import denominationsRouter from '../src/modules/denominations/denominations.routes.js'
import attendanceRouter from '../src/modules/attendance/attendance.routes.js'
import rolesRouter from '../src/modules/roles/roles.routes.js'
import UserModel, {
  dropLegacyAdminFlag
} from '../src/modules/users/users.model.js'
import { ROLE_NAMES } from '../src/modules/roles/roles.model.js'

process.env.SECURITY_JM = 'role-access-secret'

const FULL_ACCESS = ['Manager', 'Supervisor']
const LIMITED = ['Staff', 'User']
const MISSING_ID = '507f1f77bcf86cd799439011'

const MOUNTS = [
  ['/api/users', usersRouter],
  ['/api/type-inventory', typeInventoryRouter],
  ['/api/payment-types', paymentTypesRouter],
  ['/api/categories', categoriesRouter],
  ['/api/suppliers', suppliersRouter],
  ['/api/products', productsRouter],
  ['/api/inventory-records', inventoryRecordsRouter],
  ['/api/daily-information', dailyInformationRouter],
  ['/api/orders', ordersRouter],
  ['/api/tasks', tasksRouter],
  ['/api/push', pushNotificationsRouter],
  ['/api/denominations', denominationsRouter],
  ['/api/attendance', attendanceRouter],
  ['/api/roles', rolesRouter]
]

const catalogWrites = (base) => [
  `POST ${base}`,
  `PUT ${base}/:id`,
  `DELETE ${base}/:id`
]

const FULL_ACCESS_ROUTES = new Set([
  ...catalogWrites('/api/categories'),
  ...catalogWrites('/api/suppliers'),
  ...catalogWrites('/api/products'),
  ...catalogWrites('/api/payment-types'),
  ...catalogWrites('/api/type-inventory'),
  ...catalogWrites('/api/daily-information'),
  'GET /api/users',
  'GET /api/users/:id',
  'POST /api/users/register',
  'PUT /api/users/:id',
  'DELETE /api/users/:id',
  'POST /api/users/:id/logout',
  'DELETE /api/inventory-records/:id',
  'DELETE /api/orders/:id',
  'POST /api/denominations/open',
  'PUT /api/denominations'
])

const OPEN_ENTRIES = [
  ['get', '/api/products'],
  ['get', '/api/categories'],
  ['get', '/api/suppliers'],
  ['get', '/api/payment-types'],
  ['get', '/api/type-inventory'],
  ['get', '/api/orders'],
  ['get', '/api/tasks'],
  ['get', '/api/tasks/pending'],
  ['get', '/api/tasks/completed'],
  ['get', '/api/inventory-records'],
  ['get', '/api/inventory-records/reports/low-stock'],
  ['get', '/api/inventory-records/reports/stats'],
  ['get', '/api/inventory-records/liveInformation?date=2026-11-06'],
  ['get', '/api/inventory-records/reports/daily-summary?date=2026-11-06'],
  [
    'get',
    '/api/inventory-records/reports/date-range?startDate=2026-11-01&endDate=2026-11-06'
  ],
  ['get', '/api/daily-information'],
  ['get', '/api/roles'],
  ['get', '/api/users/me'],
  ['get', '/api/users/assignable'],
  ['get', '/api/attendance/me'],
  ['get', '/api/denominations']
]

const registeredRoutes = () => {
  const routes = []
  for (const [base, router] of MOUNTS) {
    for (const layer of router.stack) {
      if (!layer.route) continue
      const admin = layer.route.stack.some(
        (item) => item.name === 'requireAdmin'
      )
      const token = layer.route.stack.some(
        (item) => item.name === 'verifyToken'
      )
      for (const method of Object.keys(layer.route.methods)) {
        const path =
          layer.route.path === '/' ? base : `${base}${layer.route.path}`
        routes.push({
          method: method.toUpperCase(),
          path,
          admin,
          token,
          key: `${method.toUpperCase()} ${path}`
        })
      }
    }
  }
  return routes
}

const withId = (path) => path.replaceAll(':id', MISSING_ID)

let mongod
let app
let tokens

const call = (role, method, url) =>
  request(app)
    [method](url)
    .set('Authorization', `Bearer ${tokens[role]}`)
    .send({})

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri(), { dbName: 'jm_roles' })
  app = (await import('../src/app.js')).default
  const Role = mongoose.model('Role')
  const roles = await Role.create(ROLE_NAMES.map((name) => ({ name })))
  const byName = Object.fromEntries(roles.map((role) => [role.name, role._id]))
  tokens = {}
  for (const name of ROLE_NAMES) {
    const user = await UserModel.create({
      username: name.toLowerCase(),
      password: 'x',
      email: `${name.toLowerCase()}@jm.test`,
      role: byName[name],
      isAdmin: true
    })
    tokens[name] = jwt.sign(
      { id: String(user._id), username: user.username, role: name, tv: 0 },
      process.env.SECURITY_JM
    )
  }
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod?.stop()
})

describe('acceso por rol', () => {
  it('el usuario no guarda isAdmin', async () => {
    expect(UserModel.schema.path('isAdmin')).toBeUndefined()
    const stored = await UserModel.collection.findOne({ username: 'manager' })
    expect(stored.isAdmin).toBeUndefined()

    await UserModel.collection.updateOne(
      { username: 'manager' },
      { $set: { isAdmin: true } }
    )
    await dropLegacyAdminFlag()
    const cleaned = await UserModel.collection.findOne({ username: 'manager' })
    expect(cleaned.isAdmin).toBeUndefined()
    expect(cleaned.role).toBeTruthy()
  })

  it('requireAdmin cubre solo crear, editar, eliminar y la gestión de usuarios', () => {
    const routes = registeredRoutes()
    const adminRoutes = routes
      .filter((route) => route.admin)
      .map((route) => route.key)
    expect(new Set(adminRoutes)).toEqual(FULL_ACCESS_ROUTES)
    expect(routes.filter((route) => route.token).length).toBeGreaterThan(
      adminRoutes.length
    )
    expect(
      routes.some((route) => route.path === '/api/users/login' && !route.token)
    ).toBe(true)
  })

  it('los cuatro roles entran a las consultas', async () => {
    for (const name of ROLE_NAMES) {
      for (const [method, url] of OPEN_ENTRIES) {
        const res = await call(name, method, url)
        expect(res.status, `${name} ${method.toUpperCase()} ${url}`).toBe(200)
      }
    }
  })

  it('Staff y User no crean, editan ni eliminan lo reservado', async () => {
    const reserved = registeredRoutes().filter((route) => route.admin)
    for (const name of LIMITED) {
      for (const route of reserved) {
        const res = await call(
          name,
          route.method.toLowerCase(),
          withId(route.path)
        )
        expect(res.status, `${name} ${route.key}`).toBe(403)
        expect(res.body.message).toBe('Acceso solo para administradores')
      }
    }
  })

  it('Manager y Supervisor pasan el middleware de crear, editar y eliminar', async () => {
    const reserved = registeredRoutes().filter((route) => route.admin)
    for (const name of FULL_ACCESS) {
      for (const route of reserved) {
        const res = await call(
          name,
          route.method.toLowerCase(),
          withId(route.path)
        )
        if (res.status === 403) {
          expect(
            res.body.message,
            `${name} ${route.key} ${JSON.stringify(res.body)}`
          ).not.toBe('Acceso solo para administradores')
        }
        expect(res.status, `${name} ${route.key}`).not.toBe(401)
      }
    }
  })

  it('Manager y Supervisor crean, editan y eliminan; Staff y User solo consultan', async () => {
    for (const name of FULL_ACCESS) {
      const created = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${tokens[name]}`)
        .send({ categories: `Abarrotes ${name}` })
      expect(created.status, JSON.stringify(created.body)).toBe(201)

      const updated = await request(app)
        .put(`/api/categories/${created.body._id}`)
        .set('Authorization', `Bearer ${tokens[name]}`)
        .send({ categories: `Abarrotes ${name} editado` })
      expect(updated.status, JSON.stringify(updated.body)).toBe(200)

      for (const limited of LIMITED) {
        const seen = await call(
          limited,
          'get',
          `/api/categories/${created.body._id}`
        )
        expect(seen.status, limited).toBe(200)
        const blocked = await request(app)
          .delete(`/api/categories/${created.body._id}`)
          .set('Authorization', `Bearer ${tokens[limited]}`)
        expect(blocked.status, limited).toBe(403)
      }

      const removed = await request(app)
        .delete(`/api/categories/${created.body._id}`)
        .set('Authorization', `Bearer ${tokens[name]}`)
      expect(removed.status).toBe(200)
    }
  })

  it('los cuatro roles crean un pendiente y Staff sigue registrando movimientos', async () => {
    for (const name of ROLE_NAMES) {
      const created = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokens[name]}`)
        .send({ title: `Pendiente ${name}` })
      expect(created.status, `${name} ${JSON.stringify(created.body)}`).toBe(
        201
      )
      const removed = await request(app)
        .delete(`/api/tasks/${created.body._id}`)
        .set('Authorization', `Bearer ${tokens[name]}`)
      expect(removed.status, name).toBe(200)
    }

    for (const name of ROLE_NAMES) {
      const movement = await call(name, 'post', '/api/inventory-records')
      expect(movement.status, name).toBe(400)
      const order = await call(name, 'post', '/api/orders')
      expect(order.status, name).toBe(400)
    }
  })
})
