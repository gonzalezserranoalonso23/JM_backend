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
let entryTypeId
let issueTypeId
let cashPaymentTypeId
let cardPaymentTypeId

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
  const [entryType, issueType, cashPaymentType, cardPaymentType] =
    await Promise.all([
      mongoose
        .model('TypeInventory')
        .create({ typeInventory: 'Entrada', stockDirection: 1 }),
      mongoose
        .model('TypeInventory')
        .create({ typeInventory: 'Salida', stockDirection: -1 }),
      mongoose.model('PaymentType').create({ paymentType: 'Efectivo' }),
      mongoose.model('PaymentType').create({ paymentType: 'Tarjeta' })
    ])
  entryTypeId = String(entryType._id)
  issueTypeId = String(issueType._id)
  cashPaymentTypeId = String(cashPaymentType._id)
  cardPaymentTypeId = String(cardPaymentType._id)
  auth = jwt.sign(
    { id: userId, username: 'admin', isAdmin: true },
    process.env.SECURITY_JM
  )
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
    '/api/type-inventory',
    { typeInventory: 'Ajuste de entrada', stockDirection: 1 },
    { typeInventory: 'Ajuste de salida', stockDirection: -1 }
  )
  crud(
    '/api/payment-types',
    { paymentType: 'Transferencia' },
    { paymentType: 'Cheque' }
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

  it('un usuario modifica y elimina solo sus pendientes', async () => {
    const regular = await mongoose.model('User').create({
      username: 'cajero-tareas',
      password: 'x',
      email: 'cajero-tareas@jm.test',
      isAdmin: false
    })
    const regularAuth = jwt.sign(
      {
        id: String(regular._id),
        username: 'cajero-tareas',
        isAdmin: false,
        tv: 0
      },
      process.env.SECURITY_JM
    )
    const asRegular = (method, url) =>
      request(app)
        [method](url)
        .set('Authorization', `Bearer ${regularAuth}`)

    const own = await asRegular('post', '/api/tasks').send({
      title: 'Mi pendiente'
    })
    expect(own.status, JSON.stringify(own.body)).toBe(201)

    const completed = await asRegular('put', `/api/tasks/${own.body._id}`).send(
      { status: 'completed' }
    )
    expect(completed.status).toBe(200)
    expect((await asRegular('delete', `/api/tasks/${own.body._id}`)).status).toBe(
      200
    )

    const assigned = await api('post', '/api/tasks').send({
      title: 'Asignada al cajero',
      assignedTo: String(regular._id)
    })
    expect(
      (
        await asRegular('put', `/api/tasks/${assigned.body._id}`).send({
          title: 'Asignada y editada'
        })
      ).status
    ).toBe(200)
    expect(
      (await asRegular('delete', `/api/tasks/${assigned.body._id}`)).status
    ).toBe(200)

    const foreign = await api('post', '/api/tasks').send({
      title: 'Pendiente del admin'
    })
    expect(
      (
        await asRegular('put', `/api/tasks/${foreign.body._id}`).send({
          status: 'completed'
        })
      ).status
    ).toBe(403)
    expect(
      (await asRegular('delete', `/api/tasks/${foreign.body._id}`)).status
    ).toBe(403)
  })

  it('asigna tareas a otros usuarios', async () => {
    const users = await api('get', '/api/users/assignable')
    expect(users.status).toBe(200)
    expect(users.body[0].password).toBeUndefined()

    const created = await api('post', '/api/tasks').send({
      title: 'Revisar bodega',
      assignedTo: userId
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.assignedTo.username).toBe('admin')

    const unassigned = await api('put', `/api/tasks/${created.body._id}`).send({
      assignedTo: null
    })
    expect(unassigned.body.assignedTo).toBeNull()

    const invalid = await api('post', '/api/tasks').send({
      title: 'Inválida',
      assignedTo: '507f1f77bcf86cd799439011'
    })
    expect(invalid.status).toBe(400)
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

    // Búsqueda por nombre y proveedor; la categoría no cuenta
    for (const search of ['leche', 'distribuidora']) {
      const res = await api('get', '/api/products').query({
        page: 1,
        limit: 10,
        search
      })
      expect(res.status).toBe(200)
      expect(res.body.data.map((p) => p._id)).toContain(product._id)
    }
    const byCategory = await api('get', '/api/products').query({
      page: 1,
      limit: 10,
      search: 'abarrotes'
    })
    expect(byCategory.body.data).toHaveLength(0)
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
      typeInventory: entryTypeId,
      quantity: 5,
      totalAmount: 110
    })
    expect(entry.status, JSON.stringify(entry.body)).toBe(201)
    const issue = await api('post', '/api/inventory-records').send({
      ...base,
      typeInventory: issueTypeId,
      quantity: 3,
      totalAmount: 66,
      paymentType: cardPaymentTypeId
    })
    expect(issue.status, JSON.stringify(issue.body)).toBe(201)
    const tooMuch = await api('post', '/api/inventory-records').send({
      ...base,
      typeInventory: issueTypeId,
      quantity: 999,
      totalAmount: 1
    })
    expect(tooMuch.status).toBe(400)
    expect(
      (await api('get', `/api/products/${product._id}`)).body.productStock
    ).toBe(12)

    const bulk = await api('post', '/api/inventory-records/bulk').send({
      records: [
        { ...base, typeInventory: entryTypeId, quantity: 1, totalAmount: 22 },
        {
          ...base,
          typeInventory: issueTypeId,
          quantity: 2,
          totalAmount: 44,
          paymentType: cashPaymentTypeId
        }
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
    ).send({
      ...base,
      typeInventory: entryTypeId,
      quantity: 5,
      totalAmount: 110
    })
    expect(upRec.status).toBe(200)

    // Reporte paginado: la página y el filtro de tipo no alteran el resumen del período
    const paged = await api(
      'get',
      '/api/inventory-records/reports/date-range?startDate=2000-01-01&endDate=2999-12-31&page=1&limit=1'
    )
    expect(paged.status, JSON.stringify(paged.body)).toBe(200)
    expect(paged.body.data).toHaveLength(1)
    expect(paged.body.hasNextPage).toBe(true)
    expect(paged.body.total).toBeGreaterThan(1)
    expect(paged.body.summary[entryTypeId].count).toBeGreaterThan(0)
    expect(paged.body.summary[issueTypeId].count).toBeGreaterThan(0)

    const issuesOnly = await api(
      'get',
      `/api/inventory-records/reports/date-range?startDate=2000-01-01&endDate=2999-12-31&page=1&limit=100&type=${issueTypeId}`
    )
    expect(issuesOnly.status).toBe(200)
    expect(issuesOnly.body.total).toBe(paged.body.summary[issueTypeId].count)
    expect(
      issuesOnly.body.data.every((r) => r.typeInventory._id === issueTypeId)
    ).toBe(true)
    expect(issuesOnly.body.summary).toEqual(paged.body.summary)
    const cardOnly = await api(
      'get',
      '/api/inventory-records/reports/date-range'
    ).query({
      startDate: '2026-10-06',
      endDate: '2026-10-06',
      page: 1,
      limit: 100,
      paymentType: cardPaymentTypeId
    })
    expect(cardOnly.status, JSON.stringify(cardOnly.body)).toBe(200)
    expect(cardOnly.body.data).toHaveLength(1)
    expect(cardOnly.body.data[0].paymentType._id).toBe(cardPaymentTypeId)
    expect(cardOnly.body.summary[issueTypeId].count).toBe(1)
    expect(cardOnly.body.summary[issueTypeId].profit).toBe(21)
    const exportedCardRecords = await api(
      'get',
      '/api/inventory-records/reports/date-range'
    ).query({
      startDate: '2026-10-06',
      endDate: '2026-10-06',
      paymentType: cardPaymentTypeId
    })
    expect(exportedCardRecords.status).toBe(200)
    expect(exportedCardRecords.body.allRecords).toHaveLength(1)
    expect(exportedCardRecords.body.allRecords[0].paymentType._id).toBe(
      cardPaymentTypeId
    )
    const cashOnly = await api(
      'get',
      '/api/inventory-records/reports/date-range'
    ).query({
      startDate: '2026-10-06',
      endDate: '2026-10-06',
      page: 1,
      limit: 100,
      paymentType: cashPaymentTypeId
    })
    expect(cashOnly.status).toBe(200)
    expect(cashOnly.body.data).toHaveLength(1)
    expect(cashOnly.body.data[0].paymentType._id).toBe(cashPaymentTypeId)
    const blockedDelete = await api(
      'delete',
      `/api/payment-types/${cashPaymentTypeId}`
    )
    expect(blockedDelete.status).toBe(409)
    expect(
      (await api('get', `/api/payment-types/${cashPaymentTypeId}`)).status
    ).toBe(200)
    expect(
      (
        await api(
          'get',
          '/api/inventory-records/reports/date-range?startDate=2000-01-01&endDate=2999-12-31&page=1&type=NOPE'
        )
      ).status
    ).toBe(400)
    expect(
      (
        await api('get', '/api/inventory-records/reports/date-range').query({
          startDate: '2026-10-06',
          endDate: '2026-10-06',
          paymentType: 'CRIPTO'
        })
      ).status
    ).toBe(400)

    for (const url of [
      '/api/inventory-records/reports/low-stock',
      '/api/inventory-records/reports/date-range?startDate=2026-10-01&endDate=2026-10-31',
      `/api/inventory-records/reports/by-type?type=${issueTypeId}`,
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

    // Búsqueda en stock bajo (activo de nuevo, con stock bajo el mínimo)
    await api('put', `/api/products/${product._id}`).send({
      isActive: true,
      productStock: 0,
      minimumProductStock: 5
    })
    const hit = await api(
      'get',
      '/api/inventory-records/reports/low-stock?page=1&limit=20&search=LECHE'
    )
    expect(hit.body.data.map((p) => p._id)).toContain(product._id)
    const miss = await api(
      'get',
      '/api/inventory-records/reports/low-stock?page=1&limit=20&search=zzzz'
    )
    expect(miss.body.data).toEqual([])
    await api('put', `/api/products/${product._id}`).send({ isActive: false })

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

  it('carritos de entrada/salida: stock atómico, todo o nada, edición y borrado', async () => {
    const category = (
      await api('post', '/api/categories').send({ categories: 'Bebidas' })
    ).body
    const supplier = (
      await api('post', '/api/suppliers').send({
        suppliersName: 'Refrescos JM',
        suppliersContact: 'Ana',
        supplierPhone: '5550002222'
      })
    ).body
    const create = async (name, stock) =>
      (
        await api('post', '/api/products').send({
          productName: name,
          productDescription: '600ml',
          purchasePrice: 10,
          productPrice: 15,
          productStock: stock,
          minimumProductStock: 1,
          supplier: supplier._id,
          category: category._id
        })
      ).body
    const stockOf = async (p) =>
      (await api('get', `/api/products/${p._id}`)).body.productStock
    const line = (p, typeInventory, quantity) => ({
      date: '2026-10-07',
      typeInventory,
      productName: p._id,
      category: category._id,
      productPrice: '15',
      quantity,
      totalAmount: quantity * 15
    })

    const cola = await create('Cola', 10)
    const agua = await create('Agua', 2)

    // El carrito de salida descuenta cada producto
    const cart = await api('post', '/api/inventory-records/bulk').send({
      records: [line(cola, issueTypeId, 4), line(agua, issueTypeId, 1)]
    })
    expect(cart.status, JSON.stringify(cart.body)).toBe(201)
    expect(await stockOf(cola)).toBe(6)
    expect(await stockOf(agua)).toBe(1)

    // Si un renglón falla no queda nada a medias
    const before = (await api('get', '/api/inventory-records')).body.length
    const failed = await api('post', '/api/inventory-records/bulk').send({
      records: [line(cola, issueTypeId, 2), line(agua, issueTypeId, 5)]
    })
    expect(failed.status).toBe(400)
    expect(failed.body.availableStock).toBe(1)
    expect(failed.body.message).toMatch(/Agua/)
    expect(await stockOf(cola)).toBe(6)
    expect(await stockOf(agua)).toBe(1)
    expect((await api('get', '/api/inventory-records')).body.length).toBe(
      before
    )

    // Salidas simultáneas nunca dejan el stock negativo
    const race = await Promise.all(
      Array.from({ length: 5 }, () =>
        api('post', '/api/inventory-records').send(line(cola, issueTypeId, 2))
      )
    )
    expect(race.filter((r) => r.status === 201)).toHaveLength(3)
    expect(await stockOf(cola)).toBe(0)

    // Editar la cantidad ajusta la diferencia
    const entry = await api('post', '/api/inventory-records').send(
      line(cola, entryTypeId, 5)
    )
    expect(await stockOf(cola)).toBe(5)
    const edited = await api(
      'put',
      `/api/inventory-records/${entry.body._id}`
    ).send(line(cola, entryTypeId, 8))
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    expect(await stockOf(cola)).toBe(8)

    // Borrar una entrada ya consumida se bloquea; una vigente revierte el stock
    await api('post', '/api/inventory-records').send(line(cola, issueTypeId, 7))
    const blocked = await api(
      'delete',
      `/api/inventory-records/${entry.body._id}`
    )
    expect(blocked.status).toBe(409)
    expect(await stockOf(cola)).toBe(1)

    const sale = await api('post', '/api/inventory-records').send(
      line(agua, issueTypeId, 1)
    )
    expect(await stockOf(agua)).toBe(0)
    expect(
      (await api('delete', `/api/inventory-records/${sale.body._id}`)).status
    ).toBe(200)
    expect(await stockOf(agua)).toBe(1)
  })

  it('bulk grande de salidas: un solo lote ajusta stock y guarda todos los renglones', async () => {
    const category = (
      await api('post', '/api/categories').send({ categories: 'Mayoreo' })
    ).body
    const supplier = (
      await api('post', '/api/suppliers').send({
        suppliersName: 'Mayoreo JM',
        suppliersContact: 'Rosa',
        supplierPhone: '5550004444'
      })
    ).body
    const product = (
      await api('post', '/api/products').send({
        productName: 'Caja a granel',
        productDescription: 'pieza',
        purchasePrice: 5,
        productPrice: 9,
        productStock: 250,
        minimumProductStock: 1,
        supplier: supplier._id,
        category: category._id
      })
    ).body

    const records = Array.from({ length: 200 }, () => ({
      date: '2026-10-30',
      typeInventory: issueTypeId,
      productName: product._id,
      quantity: 1,
      paymentType: cashPaymentTypeId
    }))

    const bulk = await api('post', '/api/inventory-records/bulk').send({
      records
    })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(201)
    expect(bulk.body).toHaveLength(200)
    expect(
      (await api('get', `/api/products/${product._id}`)).body.productStock
    ).toBe(50)
  })

  it('bulk de salidas: suma el carrito y no deja renglones si uno no alcanza', async () => {
    const category = (
      await api('post', '/api/categories').send({
        categories: 'Abarrotes granel'
      })
    ).body
    const supplier = (
      await api('post', '/api/suppliers').send({
        suppliersName: 'Abarrotes JM',
        suppliersContact: 'Luis',
        supplierPhone: '5550003333'
      })
    ).body
    const create = async (name, stock) =>
      (
        await api('post', '/api/products').send({
          productName: name,
          productDescription: 'pieza',
          purchasePrice: 8,
          productPrice: 12,
          productStock: stock,
          minimumProductStock: 1,
          supplier: supplier._id,
          category: category._id
        })
      ).body
    const stockOf = async (product) =>
      (await api('get', `/api/products/${product._id}`)).body.productStock
    const countRecords = async () =>
      (await api('get', '/api/inventory-records')).body.length
    const line = (product, typeInventory, quantity) => ({
      date: '2026-10-29',
      typeInventory,
      productName: product._id,
      quantity
    })

    const arroz = await create('Arroz a granel', 0.3)
    const frijol = await create('Frijol', 10)
    const before = await countRecords()

    const grams = await api('post', '/api/inventory-records/bulk').send({
      records: [
        line(arroz, issueTypeId, 0.1),
        line(arroz, issueTypeId, 0.1),
        line(arroz, issueTypeId, 0.1)
      ]
    })
    expect(grams.status, JSON.stringify(grams.body)).toBe(201)
    expect(grams.body).toHaveLength(3)
    expect(await stockOf(arroz)).toBe(0)

    const summed = await api('post', '/api/inventory-records/bulk').send([
      line(frijol, issueTypeId, 6),
      line(frijol, issueTypeId, 6)
    ])
    expect(summed.status).toBe(400)
    expect(summed.body.productName).toBe('Frijol')
    expect(summed.body.availableStock).toBe(10)
    expect(summed.body.requestedQuantity).toBe(12)
    expect(summed.body.message).toMatch(/Frijol/)
    expect(await stockOf(frijol)).toBe(10)
    expect(await countRecords()).toBe(before + 3)

    const partial = await api('post', '/api/inventory-records/bulk').send({
      records: [
        line(frijol, issueTypeId, 4),
        { ...line(frijol, issueTypeId, 1), date: '29/10/2026' }
      ]
    })
    expect(partial.status).toBe(400)
    expect(await stockOf(frijol)).toBe(10)
    expect(await countRecords()).toBe(before + 3)

    const entry = await api('post', '/api/inventory-records/bulk').send({
      records: [
        line(frijol, entryTypeId, 2),
        line(frijol, entryTypeId, 1.5)
      ]
    })
    expect(entry.status, JSON.stringify(entry.body)).toBe(201)
    expect(await stockOf(frijol)).toBe(13.5)

    // 0.9996 se muestra como 1. Vender esa última pieza tiene que poder hacerse.
    const setStock = (product, productStock) =>
      mongoose.model('Product').collection.updateOne(
        { _id: new mongoose.Types.ObjectId(product._id) },
        { $set: { productStock } }
      )
    const ultimo = await create('Ultimo', 1)
    await setStock(ultimo, 0.9996)
    const lastPiece = await api('post', '/api/inventory-records/bulk').send({
      records: [line(ultimo, issueTypeId, 1)]
    })
    expect(lastPiece.status, JSON.stringify(lastPiece.body)).toBe(201)
    expect(await stockOf(ultimo)).toBe(0)

    const corto = await create('Corto', 1)
    await setStock(corto, 0.9994)
    const notEnough = await api('post', '/api/inventory-records/bulk').send({
      records: [line(corto, issueTypeId, 1)]
    })
    expect(notEnough.status).toBe(400)
    expect(await stockOf(corto)).toBe(0.9994)

    const doble = await create('Doble', 1)
    await setStock(doble, 0.9996)
    const split = await api('post', '/api/inventory-records/bulk').send({
      records: [line(doble, issueTypeId, 0.5), line(doble, issueTypeId, 0.5)]
    })
    expect(split.status, JSON.stringify(split.body)).toBe(201)
    expect(await stockOf(doble)).toBe(0)
  })

  it('abre la caja fuerte con el secreto y guarda las denominaciones', async () => {
    process.env.CASH_VAULT_SECRET = 'vault-secret'
    const quantities = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5].map(
      (value) => ({ value, quantity: value === 100 ? 3 : value === 0.5 ? 4 : 0 })
    )

    const denied = await api('post', '/api/denominations/open').send({
      secret: 'otra-clave'
    })
    expect(denied.status).toBe(403)

    const opened = await api('post', '/api/denominations/open').send({
      secret: 'vault-secret'
    })
    expect(opened.status, JSON.stringify(opened.body)).toBe(200)
    expect(opened.body.denominations).toHaveLength(11)
    expect(opened.body.total).toBe(0)

    const saved = await api('put', '/api/denominations').send({
      secret: 'vault-secret',
      quantities
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body.denominations.find((row) => row.value === 100).quantity).toBe(
      3
    )
    expect(saved.body.denominations.find((row) => row.value === 0.5).amount).toBe(2)
    expect(saved.body.total).toBe(302)
    expect(saved.body.updatedAt).toBeTruthy()

    const latest = await api('get', '/api/denominations')
    expect(latest.status).toBe(200)
    expect(latest.body.updatedAt).toBeTruthy()
    expect(latest.body.denominations).toBeUndefined()

    const invalid = await api('put', '/api/denominations').send({
      secret: 'vault-secret',
      quantities: [{ value: 3, quantity: 1 }]
    })
    expect(invalid.status).toBe(400)

    delete process.env.CASH_VAULT_SECRET
    const unconfigured = await api('post', '/api/denominations/open').send({
      secret: 'vault-secret'
    })
    expect(unconfigured.status).toBe(503)
    expect((await request(app).post('/api/denominations/open')).status).toBe(401)
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
      '/api/type-inventory'
    ]) {
      expect((await api('get', `${base}/no-es-id`)).status, base).toBe(400)
    }
    expect((await api('post', '/api/products').send({})).status).toBe(400)
    expect((await api('post', '/api/orders').send({})).status).toBe(400)
  })
})

describe('Autenticación y roles', () => {
  let regularId
  beforeAll(async () => {
    const regular = await mongoose.model('User').create({
      username: 'regular',
      password: 'x',
      email: 'regular@jm.test',
      isAdmin: false
    })
    regularId = String(regular._id)
  })
  const userToken = () =>
    jwt.sign(
      { id: regularId, username: 'regular', isAdmin: false },
      process.env.SECURITY_JM
    )
  const as = (token, method, url) =>
    request(app)
      [method](url)
      .set('Authorization', 'Bearer ' + token)

  it('rechaza sin token, token inválido y esquema incorrecto', async () => {
    expect((await request(app).get('/api/products')).status).toBe(401)
    expect((await as('basura', 'get', '/api/products')).status).toBe(401)
    const bad = await request(app)
      .get('/api/products')
      .set('Authorization', 'Token ' + auth)
    expect(bad.status).toBe(401)
  })

  it('user puede leer y crear pero no borrar ni gestionar usuarios', async () => {
    const t = userToken()
    expect((await as(t, 'get', '/api/products')).status).toBe(200)
    expect(
      (await as(t, 'post', '/api/categories').send({ categories: 'Roles' })).status
    ).toBe(403)
    const created = await api('post', '/api/categories').send({
      categories: 'Roles'
    })
    expect(created.status).toBe(201)
    const task = await as(t, 'post', '/api/tasks').send({ title: 'Pendiente propio' })
    expect(task.status).toBe(201)
    expect(
      (await as(t, 'delete', `/api/categories/${created.body._id}`)).status
    ).toBe(403)
    expect((await as(t, 'get', '/api/users')).status).toBe(403)
    expect((await as(t, 'post', '/api/users/register').send({})).status).toBe(
      403
    )
    expect(
      (await api('delete', `/api/categories/${created.body._id}`)).status
    ).toBe(200)
  })

  it('logout invalida los tokens emitidos del usuario', async () => {
    const t = userToken()
    expect((await as(t, 'get', '/api/products')).status).toBe(200)
    expect((await as(t, 'post', '/api/users/logout')).status).toBe(200)
    expect((await as(t, 'get', '/api/products')).status).toBe(401)
  })

  it('rechaza tokens de usuarios eliminados y de otro algoritmo', async () => {
    const ghost = new mongoose.Types.ObjectId().toString()
    const deleted = jwt.sign(
      { id: ghost, isAdmin: true },
      process.env.SECURITY_JM
    )
    expect((await as(deleted, 'get', '/api/products')).status).toBe(401)
    const hs512 = jwt.sign({ id: userId }, process.env.SECURITY_JM, {
      algorithm: 'HS512'
    })
    expect((await as(hs512, 'get', '/api/products')).status).toBe(401)
  })

  it('no expone __v, ni en documentos creados antes del cambio', async () => {
    const created = await api('post', '/api/categories').send({
      categories: 'SinVersion'
    })
    expect(created.body).not.toHaveProperty('__v')
    await mongoose.connection
      .collection('categories')
      .updateOne({ categories: 'SinVersion' }, { $set: { __v: 0 } })
    const list = await api('get', '/api/categories')
    expect(JSON.stringify(list.body)).not.toContain('__v')
    await api('delete', `/api/categories/${created.body._id}`)
  })

  it('login incluye isAdmin en el JWT', async () => {
    await mongoose.model('User').create({
      username: 'jwtadmin',
      password: await (await import('bcryptjs')).default.hash('pw12345', 4),
      email: 'jwt@jm.test',
      isAdmin: true
    })
    const res = await request(app)
      .post('/api/users/login')
      .send({ username: 'jwtadmin', password: 'pw12345' })
    expect(res.status).toBe(200)
    expect(jwt.decode(res.body.token).isAdmin).toBe(true)
  })
})
