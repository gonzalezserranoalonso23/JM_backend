import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'
import usersRouter from '../src/routes/users.routes.js'
import typeInventoryRouter from '../src/routes/typeInventory.routes.js'
import paymentTypesRouter from '../src/routes/paymentTypes.routes.js'
import categoriesRouter from '../src/routes/categories.routes.js'
import suppliersRouter from '../src/routes/suppliers.routes.js'
import productsRouter from '../src/routes/products.routes.js'
import inventoryRecordsRouter from '../src/routes/inventoryRecords.routes.js'
import dailyInformationRouter from '../src/routes/dailyInformation.routes.js'
import ordersRouter from '../src/routes/orders.routes.js'
import tasksRouter from '../src/routes/tasks.routes.js'
import pushNotificationsRouter from '../src/routes/pushNotifications.routes.js'
import denominationsRouter from '../src/routes/denominations.routes.js'
import attendanceRouter from '../src/routes/attendance.routes.js'
import rolesRouter from '../src/routes/roles.routes.js'
import UserModel, { dropLegacyAdminFlag } from '../src/models/users.model.js'
import { ROLE_NAMES } from '../src/models/roles.model.js'

process.env.SECURITY_JM = 'role-access-secret'

const FULL_ACCESS = ['Sudo', 'Manager', 'Supervisor']
const LIMITED = ['Staff']
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
      const sudo = layer.route.stack.some((item) => item.name === 'requireSudo')
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
          sudo,
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

  it('requireAdmin cubre crear, editar y eliminar', () => {
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

  it('Staff no crea, edita ni elimina lo reservado', async () => {
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

  it('Manager y Supervisor crean, editan y eliminan; Staff solo consulta', async () => {
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

  it('los roles vigentes crean un pendiente y Staff sigue registrando movimientos', async () => {
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

  it('Staff solo ve y gestiona pendientes propios o asignados', async () => {
    const managerUser = await UserModel.findOne({ username: 'manager' })
    const staffUser = await UserModel.findOne({ username: 'staff' })
    const staffCreated = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokens.Staff}`)
      .send({ title: 'Pendiente propio' })
    expect(staffCreated.status).toBe(201)

    const forbiddenAssignment = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokens.Staff}`)
      .send({ title: 'Pendiente ajeno', assignedTo: String(managerUser._id) })
    expect(forbiddenAssignment.status).toBe(403)

    const foreignTask = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokens.Manager}`)
      .send({
        title: 'Pendiente de otro usuario',
        assignedTo: String(managerUser._id)
      })
    expect(foreignTask.status).toBe(201)

    const assignedToStaff = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokens.Manager}`)
      .send({
        title: 'Pendiente asignado a Staff',
        assignedTo: String(staffUser._id)
      })
    expect(assignedToStaff.status).toBe(201)

    const staffPending = await request(app)
      .get('/api/tasks/pending')
      .set('Authorization', `Bearer ${tokens.Staff}`)
    expect(staffPending.status).toBe(200)
    const visibleTasks = staffPending.body.data || staffPending.body
    const visibleIds = visibleTasks.map((task) => String(task._id))
    expect(visibleIds).toContain(String(staffCreated.body._id))
    expect(visibleIds).toContain(String(assignedToStaff.body._id))
    expect(visibleIds).not.toContain(String(foreignTask.body._id))
    expect(
      (
        await request(app)
          .get(`/api/tasks/${foreignTask.body._id}`)
          .set('Authorization', `Bearer ${tokens.Staff}`)
      ).status
    ).toBe(404)
    expect(
      (
        await request(app)
          .put(`/api/tasks/${foreignTask.body._id}`)
          .set('Authorization', `Bearer ${tokens.Staff}`)
          .send({ status: 'completed' })
      ).status
    ).toBe(403)
    expect(
      (
        await request(app)
          .put(`/api/tasks/${assignedToStaff.body._id}`)
          .set('Authorization', `Bearer ${tokens.Staff}`)
          .send({ assignedTo: String(managerUser._id) })
      ).status
    ).toBe(403)

    await request(app)
      .delete(`/api/tasks/${staffCreated.body._id}`)
      .set('Authorization', `Bearer ${tokens.Staff}`)
    await request(app)
      .delete(`/api/tasks/${foreignTask.body._id}`)
      .set('Authorization', `Bearer ${tokens.Manager}`)
    await request(app)
      .delete(`/api/tasks/${assignedToStaff.body._id}`)
      .set('Authorization', `Bearer ${tokens.Manager}`)
  })

  it('sudo no aparece para los demás ni recibe pendientes', async () => {
    const visible = await call('Sudo', 'get', '/api/users')
    const sudoUser = visible.body.find((user) => user.username === 'sudo')
    expect(sudoUser?.role?.name).toBe('Sudo')

    for (const name of ['Manager', 'Supervisor', 'Staff']) {
      const list = await call(name, 'get', '/api/users')
      const names = Array.isArray(list.body) ? list.body : list.body.data
      expect(list.status, name).toBe(name === 'Staff' ? 403 : 200)
      if (list.status === 200) {
        expect(names.some((user) => user.role?.name === 'Sudo')).toBe(false)
      }
      const one = await call(name, 'get', `/api/users/${sudoUser._id}`)
      expect(one.status, name).toBe(name === 'Staff' ? 403 : 404)
    }

    for (const name of ROLE_NAMES) {
      const assignable = await call(name, 'get', '/api/users/assignable')
      expect(assignable.status, name).toBe(200)
      expect(assignable.body.some((user) => user.username === 'sudo')).toBe(
        false
      )
    }

    const assigned = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ title: 'Para sudo', assignedTo: sudoUser._id })
    expect(assigned.status).toBe(400)
  })

  it('solo sudo cierra sesiones y administra roles', async () => {
    const reserved = registeredRoutes().filter((route) => route.sudo)
    expect(reserved.map((route) => route.key).sort()).toEqual(
      [
        'POST /api/users/:id/logout',
        'POST /api/roles',
        'PUT /api/roles/:id',
        'DELETE /api/roles/:id'
      ].sort()
    )
    for (const name of ['Manager', 'Supervisor', ...LIMITED]) {
      for (const route of reserved) {
        const res = await call(
          name,
          route.method.toLowerCase(),
          withId(route.path)
        )
        expect(res.status, `${name} ${route.key}`).toBe(403)
        expect(res.body.message).toBe('Acceso solo para sudo')
      }
    }
    const list = await call('Manager', 'get', '/api/users')
    expect(list.status, JSON.stringify(list.body)).toBe(200)
  })

  it('manager no asigna sudo y supervisor no asigna administradores', async () => {
    const roles = await call('Manager', 'get', '/api/roles')
    const roleId = (name) => roles.body.find((role) => role.name === name)._id
    const denied = await request(app)
      .post('/api/users/register')
      .set('Authorization', `Bearer ${tokens.Manager}`)
      .send({
        username: 'otro-sudo',
        password: 'abc12345',
        role: roleId('Sudo')
      })
    expect(denied.status).toBe(403)

    const supervisorDenied = await request(app)
      .post('/api/users/register')
      .set('Authorization', `Bearer ${tokens.Supervisor}`)
      .send({
        username: 'otro-manager',
        password: 'abc12345',
        role: roleId('Manager')
      })
    expect(supervisorDenied.status).toBe(403)

    const created = await request(app)
      .post('/api/users/register')
      .set('Authorization', `Bearer ${tokens.Supervisor}`)
      .send({
        username: 'cajero-nuevo',
        password: 'abc12345',
        role: roleId('Staff')
      })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
  })

  it('sudo crea un rol y no cambia los del sistema', async () => {
    const created = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ name: 'Cajero' })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.locked).toBe(false)

    const list = await call('Staff', 'get', '/api/roles')
    const staff = list.body.find((role) => role.name === 'Staff')
    expect(staff.locked).toBe(true)

    const renamed = await request(app)
      .put(`/api/roles/${staff._id}`)
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ name: 'Otro' })
    expect(renamed.status).toBe(403)

    const blocked = await request(app)
      .delete(`/api/roles/${staff._id}`)
      .set('Authorization', `Bearer ${tokens.Sudo}`)
    expect(blocked.status).toBe(403)

    const edited = await request(app)
      .put(`/api/roles/${created.body._id}`)
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ name: 'Cajero 2' })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)

    const removed = await request(app)
      .delete(`/api/roles/${created.body._id}`)
      .set('Authorization', `Bearer ${tokens.Sudo}`)
    expect(removed.status).toBe(200)
  })

  it('no permite crear ni recuperar el rol retirado', async () => {
    const created = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ name: 'User' })
    expect(created.status).toBe(400)

    const customRole = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ name: 'Temporal' })
    expect(customRole.status).toBe(201)

    const renamed = await request(app)
      .put(`/api/roles/${customRole.body._id}`)
      .set('Authorization', `Bearer ${tokens.Sudo}`)
      .send({ name: 'User' })
    expect(renamed.status).toBe(400)
  })
})
