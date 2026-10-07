import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.SECURITY_JM = 'integration-secret'

let mongod
let app
let auth
let userId

const api = (method, url) =>
  request(app)[method](url).set('Authorization', `Bearer ${auth}`)

const crud = (base, createBody, updateBody) => {
  it(`CRUD ${base}`, async () => {
    const created = await api('post', base).send(createBody)
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const id = created.body._id
    expect(id).toBeTruthy()

    const list = await api('get', base)
    expect(list.status).toBe(200)
    expect((list.body.data || list.body).length).toBeGreaterThan(0)

    const one = await api('get', `${base}/${id}`)
    expect(one.status).toBe(200)

    const updated = await api('put', `${base}/${id}`).send(updateBody)
    expect(updated.status, JSON.stringify(updated.body)).toBe(200)

    const removed = await api('delete', `${base}/${id}`)
    expect(removed.status).toBe(200)
    expect((await api('get', `${base}/${id}`)).status).toBe(404)
  })
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri(), { dbName: 'jm_test' })
  app = (await import('../src/app.js')).default
  const user = await mongoose.model('User').create({
    username: 'admin',
    password: 'x',
    email: 'admin@jm.test',
    isAdmin: true
  })
  userId = String(user._id)
  auth = jwt.sign({ id: userId, username: 'admin' }, process.env.SECURITY_JM)
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  await mongod?.stop()
})

describe('Integración con MongoDB real', () => {
  it('responde en / y /health sin token', async () => {
    expect((await request(app).get('/')).status).toBe(200)
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' })
  })

  it('login, token inválido y registro de usuarios', async () => {
    const bcrypt = (await import('bcryptjs')).default
    await mongoose.model('User').create({
      username: 'cajero',
      password: await bcrypt.hash('secreto1', 10),
      email: 'cajero@jm.test',
      isAdmin: false
    })
    const ok = await request(app)
      .post('/api/users/login')
      .send({ username: 'cajero', password: 'secreto1' })
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()

    const bad = await request(app)
      .post('/api/users/login')
      .send({ username: 'cajero', password: 'otra' })
    expect(bad.status).toBe(401)

    expect((await request(app).get('/api/products')).status).toBe(401)

    const reg = await api('post', '/api/users/register').send({
      username: 'nuevo',
      password: 'abc12345',
      email: 'nuevo@jm.test',
      fullName: 'Nuevo Usuario',
      isAdmin: false
    })
    expect(reg.status).toBe(201)
    const dup = await api('post', '/api/users/register').send({
      username: 'nuevo',
      password: 'abc12345',
      email: 'otro@jm.test'
    })
    expect(dup.status).toBe(409)

    const list = await api('get', '/api/users').query({ page: 1, limit: 5 })
    expect(list.status).toBe(200)
    expect(list.body.data.every((u) => !u.password)).toBe(true)

    const found = list.body.data.find((u) => u.username === 'nuevo')
    const upd = await api('put', `/api/users/${found._id}`).send({
      username: 'nuevo',
      password: 'abc12345',
      email: 'nuevo@jm.test',
      fullName: 'Editado',
      isAdmin: false
    })
    expect(upd.status).toBe(200)
    const noPass = await api('put', `/api/users/${found._id}`).send({
      fullName: 'Sin contraseña',
      isAdmin: true
    })
    expect(noPass.status, JSON.stringify(noPass.body)).toBe(200)
    expect(noPass.body.fullName).toBe('Sin contraseña')
    expect(noPass.body.username).toBe('nuevo')
    const relogin = await request(app)
      .post('/api/users/login')
      .send({ username: 'nuevo', password: 'abc12345' })
    expect(relogin.status).toBe(200)
    expect((await api('delete', `/api/users/${found._id}`)).status).toBe(200)
  })

  crud('/api/categories', { categories: 'Bebidas' }, { categories: 'Lácteos' })
  crud(
    '/api/suppliers',
    {
      suppliersName: 'Proveedor Uno',
      suppliersContact: 'Ana',
      supplierPhone: '5551234567'
    },
    {
      suppliersName: 'Proveedor Uno',
      suppliersContact: 'Luis',
      supplierPhone: '5551234567'
    }
  )
  crud(
    '/api/payment-types',
    { paymentType: 'Efectivo' },
    { paymentType: 'Tarjeta' }
  )
  crud(
    '/api/type-inventory',
    { typeInventory: 'Entrada' },
    { typeInventory: 'Salida' }
  )
  crud(
    '/api/daily-information',
    {
      date: '2026-10-06',
      cashSales: 100,
      cardSales: 50,
      totalSales: 150,
      totalTransactions: 5
    },
    {
      date: '2026-10-06',
      cashSales: 200,
      cardSales: 50,
      totalSales: 250,
      totalTransactions: 6
    }
  )

  it('CRUD /api/tasks y filtros pending/completed', async () => {
    const created = await api('post', '/api/tasks').send({
      title: 'Surtir refrigerador',
      priority: 'high'
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const id = created.body._id
    expect((await api('get', '/api/tasks/pending')).status).toBe(200)
    const done = await api('put', `/api/tasks/${id}`).send({
      status: 'completed'
    })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect((await api('get', '/api/tasks/completed')).status).toBe(200)
    expect((await api('get', '/api/tasks')).status).toBe(200)
    expect((await api('get', `/api/tasks/${id}`)).status).toBe(200)
    expect((await api('delete', `/api/tasks/${id}`)).status).toBe(200)
  })

  it('flujo completo: producto, órdenes, inventario, stock y reportes', async () => {
    const category = (
      await api('post', '/api/categories').send({ categories: 'Abarrotes' })
    ).body
    const supplier = (
      await api('post', '/api/suppliers').send({
        suppliersName: 'Distribuidora JM',
        suppliersContact: 'Eva',
        supplierPhone: '5550001111'
      })
    ).body
    const productRes = await api('post', '/api/products').send({
      productName: 'Leche entera',
      productDescription: '1L',
      purchasePrice: 15,
      productPrice: 22,
      productStock: 10,
      minimumProductStock: 5,
      supplier: supplier._id,
      category: category._id
    })
    expect(productRes.status, JSON.stringify(productRes.body)).toBe(201)
    const product = productRes.body

    // Búsqueda por nombre, proveedor y categoría
    for (const search of ['leche', 'distribuidora', 'abarrotes']) {
      const res = await api('get', '/api/products').query({
        page: 1,
        limit: 10,
        search
      })
      expect(res.status).toBe(200)
      expect(res.body.data.map((p) => p._id)).toContain(product._id)
    }
    const none = await api('get', '/api/products').query({
      page: 1,
      limit: 10,
      search: 'zzz'
    })
    expect(none.body.data).toHaveLength(0)

    const upd = await api('put', `/api/products/${product._id}`).send({
      isActive: false
    })
    expect(upd.status).toBe(200)
    await api('put', `/api/products/${product._id}`).send({ isActive: true })

    // Entrada suma, salida resta, salida excesiva se rechaza
    const base = {
      date: '2026-10-06',
      productName: product._id,
      category: category._id,
      productPrice: '22'
    }
    const entry = await api('post', '/api/inventory-records').send({
      ...base,
      typeInventory: 'ENTRY',
      quantity: 5,
      totalAmount: 110
    })
    expect(entry.status, JSON.stringify(entry.body)).toBe(201)
    const issue = await api('post', '/api/inventory-records').send({
      ...base,
      typeInventory: 'ISSUE',
      quantity: 3,
      totalAmount: 66
    })
    expect(issue.status, JSON.stringify(issue.body)).toBe(201)
    const tooMuch = await api('post', '/api/inventory-records').send({
      ...base,
      typeInventory: 'ISSUE',
      quantity: 999,
      totalAmount: 1
    })
    expect(tooMuch.status).toBe(400)
    expect(
      (await api('get', `/api/products/${product._id}`)).body.productStock
    ).toBe(12)

    const bulk = await api('post', '/api/inventory-records/bulk').send({
      records: [
        { ...base, typeInventory: 'ENTRY', quantity: 1, totalAmount: 22 },
        { ...base, typeInventory: 'ISSUE', quantity: 2, totalAmount: 44 }
      ]
    })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    expect(
      (await api('get', `/api/products/${product._id}`)).body.productStock
    ).toBe(11)

    const records = await api('get', '/api/inventory-records')
    expect(records.status).toBe(200)
    expect(
      (await api('get', `/api/inventory-records/${entry.body._id}`)).status
    ).toBe(200)
    const upRec = await api(
      'put',
      `/api/inventory-records/${entry.body._id}`
    ).send({ ...base, typeInventory: 'ENTRY', quantity: 5, totalAmount: 110 })
    expect(upRec.status).toBe(200)

    for (const url of [
      '/api/inventory-records/reports/daily-summary?date=2026-10-06',
      '/api/inventory-records/reports/low-stock',
      '/api/inventory-records/reports/date-range?startDate=2026-10-01&endDate=2026-10-31',
      '/api/inventory-records/reports/by-type?type=ISSUE',
      '/api/inventory-records/reports/stats'
    ]) {
      const res = await api('get', url)
      expect(res.status, `${url} ${JSON.stringify(res.body)}`).toBe(200)
    }

    // Producto inactivo no aparece en bajo stock ni en estadísticas
    await api('put', `/api/products/${product._id}`).send({
      isActive: false,
      productStock: 1
    })
    const low = await api('get', '/api/inventory-records/reports/low-stock')
    expect(JSON.stringify(low.body)).not.toContain(product._id)

    // Órdenes
    const order = await api('post', '/api/orders').send({
      date: '2026-10-06',
      supplier: supplier._id,
      items: [
        {
          productId: product._id,
          productName: 'Leche entera',
          quantity: 10,
          price: 15,
          subtotal: 150
        }
      ],
      totalAmount: 150
    })
    expect(order.status, JSON.stringify(order.body)).toBe(201)
    expect((await api('get', '/api/orders')).status).toBe(200)
    expect((await api('get', `/api/orders/${order.body._id}`)).status).toBe(200)
    const confirm = await api('put', `/api/orders/${order.body._id}`).send({
      status: 'confirmado'
    })
    expect(confirm.body.status).toBe('confirmado')
    expect((await api('delete', `/api/orders/${order.body._id}`)).status).toBe(
      200
    )
    expect(
      (await api('delete', `/api/inventory-records/${issue.body._id}`)).status
    ).toBe(200)
    expect((await api('delete', `/api/products/${product._id}`)).status).toBe(
      200
    )
  })

  it('valida IDs inválidos y campos requeridos', async () => {
    for (const base of [
      '/api/products',
      '/api/categories',
      '/api/suppliers',
      '/api/orders',
      '/api/tasks',
      '/api/users',
      '/api/inventory-records',
      '/api/daily-information',
      '/api/payment-types',
      '/api/type-inventory'
    ]) {
      expect((await api('get', `${base}/no-es-id`)).status, base).toBe(400)
    }
    expect((await api('post', '/api/products').send({})).status).toBe(400)
    expect((await api('post', '/api/orders').send({})).status).toBe(400)
  })
})
