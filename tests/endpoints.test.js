import { beforeAll, describe, expect, it, vi } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'

const TEST_ID = '507f1f77bcf86cd799439011'

const { makeModel, makeQuery } = vi.hoisted(() => {
  const id = '507f1f77bcf86cd799439011'

  const makeDocument = (overrides = {}) => ({
    _id: id,
    productStock: 10,
    productPrice: 20,
    minimumProductStock: 2,
    totalSales: 0,
    totalTransactions: 0,
    status: 'pending',
    title: 'Tarea de prueba',
    save: vi.fn().mockResolvedValue(true),
    ...overrides
  })

  const makeQuery = (result) => {
    const promise = Promise.resolve(result)
    return {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
      catch: (onRejected) => promise.catch(onRejected)
    }
  }

  const makeModel = () => {
    class MockModel {
      constructor(data = {}) {
        Object.assign(this, data)
      }

      save = vi.fn().mockImplementation(async () => ({ ...this, _id: id }))

      populate = vi.fn().mockImplementation(async () => ({ ...this, _id: id }))

      static find = vi.fn(() => makeQuery([]))

      static countDocuments = vi.fn().mockResolvedValue(0)

      static findById = vi.fn(() => makeQuery(makeDocument()))

      static findOne = vi.fn().mockResolvedValue(null)

      static findOneAndUpdate = vi.fn(() => makeQuery(makeDocument()))

      static findByIdAndUpdate = vi.fn(() => makeQuery(makeDocument()))

      static findOneAndDelete = vi.fn().mockResolvedValue(makeDocument())

      static findByIdAndDelete = vi.fn().mockResolvedValue(makeDocument())

      static deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 })
    }

    return MockModel
  }

  return { makeModel, makeQuery }
})

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('test-hash')
  }
}))

vi.mock('../src/models/Categories.models.js', () => ({ default: makeModel() }))
vi.mock('../src/models/DailyInformation.models.js', () => ({
  default: makeModel()
}))
vi.mock('../src/models/InventoryRecord.models.js', () => ({
  default: makeModel()
}))
vi.mock('../src/models/Orders.models.js', () => ({ default: makeModel() }))
vi.mock('../src/models/PaymentsType.models.js', () => ({
  default: makeModel()
}))
vi.mock('../src/models/Products.models.js', () => ({ default: makeModel() }))
vi.mock('../src/models/ Suppliers.models.js', () => ({
  default: makeModel()
}))
vi.mock('../src/models/Tasks.models.js', () => ({ default: makeModel() }))
vi.mock('../src/models/TypeInventory.models.js', () => ({
  default: makeModel()
}))
vi.mock('../src/models/Users.models.js', () => ({ default: makeModel() }))

import CategoriesRouter from '../src/routes/Categories.routes.js'
import DailyInformationRouter from '../src/routes/DailyInformation.routes.js'
import InventoryRecordRouter from '../src/routes/InventoryRecord.routes.js'
import OrdersRouter from '../src/routes/Orders.routes.js'
import PaymentsTypeRouter from '../src/routes/PaymentsType.routes.js'
import ProductsRouter from '../src/routes/Products.routes.js'
import SuppliersRouter from '../src/routes/Suppliers.routes.js'
import TasksRouter from '../src/routes/Tasks.routes.js'
import TypeInventoryRouter from '../src/routes/TypeInventory.routes.js'
import UsersRouter from '../src/routes/Users.routes.js'
import CategoriesModel from '../src/models/Categories.models.js'
import DailyInformationModel from '../src/models/DailyInformation.models.js'
import InventoryRecordModel from '../src/models/InventoryRecord.models.js'
import OrdersModel from '../src/models/Orders.models.js'
import PaymentTypeModel from '../src/models/PaymentsType.models.js'
import ProductModel from '../src/models/Products.models.js'
import SupplierModel from '../src/models/ Suppliers.models.js'
import TaskModel from '../src/models/Tasks.models.js'
import TypeInventoryModel from '../src/models/TypeInventory.models.js'
import UserModel from '../src/models/Users.models.js'

const routers = [
  ['/api/users', UsersRouter],
  ['/api/categories', CategoriesRouter],
  ['/api/daily-information', DailyInformationRouter],
  ['/api/inventory-records', InventoryRecordRouter],
  ['/api/orders', OrdersRouter],
  ['/api/payment-types', PaymentsTypeRouter],
  ['/api/products', ProductsRouter],
  ['/api/suppliers', SuppliersRouter],
  ['/api/tasks', TasksRouter],
  ['/api/type-inventory', TypeInventoryRouter]
]

const app = express()
app.use(express.json())
routers.forEach(([prefix, router]) => app.use(prefix, router))

const endpoints = routers.flatMap(([prefix, router]) =>
  router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => {
        const path = layer.route.path === '/' ? '' : layer.route.path
        const middleware = layer.route.stack.map((item) => item.handle.name)

        return {
          method,
          url: `${prefix}${path}`.replace(':id', TEST_ID),
          path: layer.route.path,
          prefix,
          isProtected: middleware.includes('verifyToken')
        }
      })
    )
)

const modelsByPrefix = {
  '/api/users': UserModel,
  '/api/categories': CategoriesModel,
  '/api/daily-information': DailyInformationModel,
  '/api/inventory-records': InventoryRecordModel,
  '/api/orders': OrdersModel,
  '/api/payment-types': PaymentTypeModel,
  '/api/products': ProductModel,
  '/api/suppliers': SupplierModel,
  '/api/tasks': TaskModel,
  '/api/type-inventory': TypeInventoryModel
}

const missingResultMethod = {
  '/api/users': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  },
  '/api/categories': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  },
  '/api/daily-information': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'findOneAndDelete'
  },
  '/api/inventory-records': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  },
  '/api/orders': {
    get: 'findById',
    put: 'findByIdAndUpdate',
    delete: 'findByIdAndDelete'
  },
  '/api/payment-types': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  },
  '/api/products': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  },
  '/api/suppliers': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  },
  '/api/tasks': {
    get: 'findById',
    put: 'findById',
    delete: 'findByIdAndDelete'
  },
  '/api/type-inventory': {
    get: 'findById',
    put: 'findOneAndUpdate',
    delete: 'deleteOne'
  }
}

const idEndpoints = endpoints.filter(
  (endpoint) =>
    endpoint.path.includes(':id') &&
    ['get', 'put', 'delete'].includes(endpoint.method)
)

const requestBody = (endpoint) => {
  const commonBody = {
    categories: 'Categoría de prueba',
    date: '2026-10-05',
    cashSales: 100,
    cardSales: 50,
    totalSales: 150,
    totalTransactions: 5,
    typeInventory: 'ENTRY',
    productName: TEST_ID,
    category: TEST_ID,
    productPrice: 20,
    quantity: 1,
    purchasePrice: 15,
    minimumProductStock: 0,
    productStock: 0,
    supplier: TEST_ID,
    supplierPhone: '5551234567',
    suppliersName: 'Proveedor de prueba',
    items: [{ productId: TEST_ID, quantity: 1, price: 20 }],
    totalAmount: 20,
    paymentType: 'Efectivo',
    title: 'Tarea de prueba',
    description: 'Descripción de prueba',
    priority: 'medium',
    username: 'test-user',
    password: 'test-password',
    email: 'test@example.com',
    fullName: 'Usuario de prueba'
  }

  if (endpoint.url === '/api/users/login') {
    return { username: 'missing-user', password: 'test-password' }
  }
  if (endpoint.url === '/api/inventory-records/bulk') {
    return {
      records: [
        {
          ...commonBody,
          quantity: 1
        }
      ]
    }
  }

  return commonBody
}

const expectedStatus = (endpoint) => {
  if (endpoint.url === '/api/users/login') return 200
  if (endpoint.method === 'post') return 201
  return 200
}

describe('HTTP endpoint coverage', () => {
  let token

  beforeAll(() => {
    process.env.SECURITY_JM = 'endpoint-test-secret'
    token = jwt.sign(
      { id: TEST_ID, username: 'test-user' },
      process.env.SECURITY_JM
    )
  })

  it.each(endpoints)(
    '$method $url returns the expected response for a valid request',
    async (endpoint) => {
      if (endpoint.url === '/api/users/login') {
        UserModel.findOne.mockResolvedValueOnce({
          _id: TEST_ID,
          username: 'test-user',
          password: 'test-hash',
          isAdmin: true
        })
      }

      let endpointRequest = request(app)[endpoint.method](endpoint.url)

      if (endpoint.isProtected) {
        endpointRequest = endpointRequest.set(
          'Authorization',
          `Bearer ${token}`
        )
      }

      if (['post', 'put', 'patch'].includes(endpoint.method)) {
        endpointRequest = endpointRequest.send(requestBody(endpoint))
      }

      if (endpoint.url.endsWith('/reports/date-range')) {
        endpointRequest = endpointRequest.query({
          startDate: '2026-10-01',
          endDate: '2026-10-05'
        })
      }
      if (endpoint.url.endsWith('/reports/by-type')) {
        endpointRequest = endpointRequest.query({ type: 'ENTRY' })
      }

      const response = await endpointRequest
      expect(response.status).toBe(expectedStatus(endpoint))
    }
  )

  it.each(endpoints.filter((endpoint) => endpoint.isProtected))(
    '$method $url rejects requests without a token',
    async (endpoint) => {
      const response = await request(app)[endpoint.method](endpoint.url)
      expect(response.status).toBe(401)
    }
  )

  it.each(idEndpoints)(
    '$method $url rejects malformed IDs',
    async (endpoint) => {
      let endpointRequest = request(app)
        [endpoint.method](endpoint.url.replace(TEST_ID, 'invalid-id'))
        .set('Authorization', `Bearer ${token}`)

      if (endpoint.method === 'put') {
        endpointRequest = endpointRequest.send(requestBody(endpoint))
      }

      const response = await endpointRequest
      expect(response.status).toBe(400)
    }
  )

  it.each(idEndpoints)(
    '$method $url returns 404 when the record does not exist',
    async (endpoint) => {
      const model = modelsByPrefix[endpoint.prefix]
      const methodName = missingResultMethod[endpoint.prefix][endpoint.method]
      const modelMethod = model[methodName]

      if (endpoint.method === 'delete' && methodName === 'deleteOne') {
        modelMethod.mockResolvedValue({ deletedCount: 0 })
      } else if (
        endpoint.method === 'delete' &&
        ['findByIdAndDelete', 'findOneAndDelete'].includes(methodName)
      ) {
        modelMethod.mockResolvedValue(null)
      } else {
        modelMethod.mockReturnValue(makeQuery(null))
      }

      let endpointRequest = request(app)
        [endpoint.method](endpoint.url)
        .set('Authorization', `Bearer ${token}`)

      if (endpoint.method === 'put') {
        endpointRequest = endpointRequest.send(requestBody(endpoint))
      }

      const response = await endpointRequest
      expect(response.status).toBe(404)
    }
  )

  it('rejects malformed authorization tokens', async () => {
    const response = await request(app)
      .get('/api/categories')
      .set('Authorization', 'Bearer invalid-token')

    expect(response.status).toBe(401)
  })

  it('returns a bounded products page with pagination metadata', async () => {
    const productQuery = makeQuery([{ _id: TEST_ID }])
    ProductModel.find.mockReturnValue(productQuery)
    ProductModel.countDocuments.mockResolvedValue(45)

    const response = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 2, limit: 20 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      data: [{ _id: TEST_ID }],
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true
    })
    expect(ProductModel.countDocuments).toHaveBeenCalledWith({})
    expect(productQuery.skip).toHaveBeenCalledWith(20)
    expect(productQuery.limit).toHaveBeenCalledWith(20)
  })

  it.each([
    ['/api/categories', CategoriesModel],
    ['/api/suppliers', SupplierModel],
    ['/api/users', UserModel],
    ['/api/inventory-records/reports/low-stock', ProductModel]
  ])('paginates %s in the backend', async (url, model) => {
    model.find.mockReturnValueOnce(makeQuery([]))
    model.countDocuments.mockResolvedValueOnce(41)

    const response = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 2, limit: 20 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      data: [],
      page: 2,
      limit: 20,
      total: 41,
      totalPages: 3,
      hasNextPage: true
    })
  })

  it('applies product and user search filters before paginating', async () => {
    ProductModel.find.mockReturnValueOnce(makeQuery([]))
    ProductModel.countDocuments.mockResolvedValueOnce(1)
    SupplierModel.find.mockReturnValueOnce(makeQuery([{ _id: 'sup1' }]))
    CategoriesModel.find.mockReturnValueOnce(makeQuery([{ _id: 'cat1' }]))
    UserModel.find.mockReturnValueOnce(makeQuery([]))
    UserModel.countDocuments.mockResolvedValueOnce(1)

    const productResponse = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 20, search: 'leche' })
    const userResponse = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 20, search: 'ana+' })

    expect(productResponse.status).toBe(200)
    expect(ProductModel.find).toHaveBeenLastCalledWith({
      $or: [
        { productName: { $regex: 'leche', $options: 'i' } },
        { supplier: { $in: ['sup1'] } },
        { category: { $in: ['cat1'] } }
      ]
    })
    expect(userResponse.status).toBe(200)
    expect(UserModel.find).toHaveBeenLastCalledWith({
      $or: [
        { username: { $regex: 'ana\\+', $options: 'i' } },
        { fullName: { $regex: 'ana\\+', $options: 'i' } },
        { email: { $regex: 'ana\\+', $options: 'i' } }
      ]
    })
  })

  it('rejects invalid pagination parameters', async () => {
    const response = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 0, limit: 20 })

    expect(response.status).toBe(400)
  })

  it('validates date-range and inventory-type report filters', async () => {
    const missingDateRange = await request(app)
      .get('/api/inventory-records/reports/date-range')
      .set('Authorization', `Bearer ${token}`)

    const invalidInventoryType = await request(app)
      .get('/api/inventory-records/reports/by-type')
      .set('Authorization', `Bearer ${token}`)
      .query({ type: 'UNKNOWN' })

    expect(missingDateRange.status).toBe(400)
    expect(invalidInventoryType.status).toBe(400)
  })

  it('validates required request fields on login, tasks, orders and bulk inventory', async () => {
    const missingLoginFields = await request(app)
      .post('/api/users/login')
      .send({})

    const missingTaskTitle = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    const missingOrderItems = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplier: TEST_ID, items: [] })

    const emptyBulkInventory = await request(app)
      .post('/api/inventory-records/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ records: [] })

    expect(missingLoginFields.status).toBe(400)
    expect(missingTaskTitle.status).toBe(400)
    expect(missingOrderItems.status).toBe(400)
    expect(emptyBulkInventory.status).toBe(400)
  })
})
