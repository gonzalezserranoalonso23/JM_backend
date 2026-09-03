import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn()
  }
}))

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'test-token')
  }
}))

const { makeModel } = vi.hoisted(() => {
  const makeModel = (methods = {}) => {
    class MockModel {
      constructor(data = {}) {
        Object.assign(this, data)
      }
    }

    Object.assign(MockModel, methods)
    return MockModel
  }

  return { makeModel }
})

vi.mock('../src/models/Categories.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/models/DailyInformation.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn()
  })
}))

vi.mock('../src/models/Products.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/models/Orders.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn()
  })
}))

vi.mock('../src/models/PaymentsType.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/models/ Suppliers.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/models/TypeInventory.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/models/Tasks.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn()
  })
}))

vi.mock('../src/models/Users.models.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

import bcrypt from 'bcryptjs'
import CategoriesModel from '../src/models/Categories.models.js'
import {
  getCategories,
  createCategory
} from '../src/controllers/Categories.controllers.js'
import {
  getDailyInformations,
  createDailyInformation
} from '../src/controllers/DailyInformation.controllers.js'
import {
  createInventoryRecord,
  getInventoryRecords
} from '../src/controllers/InventoryRecord.controllers.js'
import {
  createOrder,
  getOrders
} from '../src/controllers/Orders.controllers.js'
import {
  createPaymentType,
  getPaymentTypes
} from '../src/controllers/PaymentsType.controllers.js'
import {
  createProduct,
  getProducts
} from '../src/controllers/Products.controllers.js'
import {
  createSupplier,
  getSuppliers
} from '../src/controllers/Suppliers.controllers.js'
import { createTask, getTasks } from '../src/controllers/Tasks.controllers.js'
import {
  createTypeInventory,
  getTypeInventories
} from '../src/controllers/TypeInventory.controllers.js'
import { getUsers, loginUser } from '../src/controllers/Users.controllers.js'
import UsersModel from '../src/models/Users.models.js'
import ProductModel from '../src/models/Products.models.js'
import InventoryRecord from '../src/models/InventoryRecord.models.js'
import OrderModel from '../src/models/Orders.models.js'
import PaymentTypeModel from '../src/models/PaymentsType.models.js'
import SupplierModel from '../src/models/ Suppliers.models.js'
import TypeInventoryModel from '../src/models/TypeInventory.models.js'
import TaskModel from '../src/models/Tasks.models.js'
import DailyInformationModel from '../src/models/DailyInformation.models.js'

const mockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
})

describe('Controller smoke tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns categories list', async () => {
    CategoriesModel.find.mockResolvedValue([
      { _id: 'cat-1', categories: 'Limpieza' }
    ])

    const req = {}
    const res = mockRes()

    await getCategories(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([
      { _id: 'cat-1', categories: 'Limpieza' }
    ])
  })

  it('creates a category', async () => {
    const req = { body: { categories: 'Bebidas' } }
    const res = mockRes()

    const saveSpy = vi
      .fn()
      .mockResolvedValue({ _id: 'cat-1', categories: 'Bebidas' })
    CategoriesModel.prototype.save = saveSpy

    await createCategory(req, res)

    expect(saveSpy).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('returns daily information', async () => {
    DailyInformationModel.find.mockResolvedValue([{ _id: 'd-1' }])

    const res = mockRes()
    await getDailyInformations({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('creates daily information', async () => {
    const res = mockRes()
    const saveSpy = vi.fn().mockResolvedValue({ _id: 'd-1' })
    DailyInformationModel.prototype.save = saveSpy

    await createDailyInformation(
      {
        body: {
          date: '2026-09-03',
          cashSales: 10,
          cardSales: 5,
          totalSales: 15,
          totalTransactions: 2
        }
      },
      res
    )

    expect(saveSpy).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('rejects invalid inventory type', async () => {
    const res = mockRes()

    await createInventoryRecord(
      {
        body: {
          date: '2026-09-03',
          typeInventory: 'INVALID',
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 15,
          quantity: 2,
          totalAmount: 30,
          Observations: 'test'
        },
        userId: 'u-1'
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('lists inventory records', async () => {
    const res = mockRes()
    vi.spyOn(InventoryRecord, 'find').mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockResolvedValue([{ _id: 'r-1' }])
    })

    await getInventoryRecords({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('lists orders', async () => {
    OrderModel.find.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockResolvedValue([{ _id: 'o-1' }])
    })

    const res = mockRes()
    await getOrders({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('creates payment type', async () => {
    const res = mockRes()
    const saveSpy = vi
      .fn()
      .mockResolvedValue({ _id: 'pt-1', paymentType: 'Efectivo' })
    PaymentTypeModel.prototype.save = saveSpy

    await createPaymentType({ body: { paymentType: 'Efectivo' } }, res)

    expect(saveSpy).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('lists payment types', async () => {
    PaymentTypeModel.find.mockResolvedValue([
      { _id: 'pt-1', paymentType: 'Efectivo' }
    ])
    const res = mockRes()

    await getPaymentTypes({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('rejects product without purchase price', async () => {
    const res = mockRes()

    await createProduct(
      {
        body: {
          productName: 'Galletas',
          productDescription: 'Snack',
          productPrice: 20,
          minimumProductStock: 5,
          productStock: 10,
          supplier: 'sup-1',
          category: 'cat-1'
        }
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('lists products', async () => {
    const query = {
      populate: vi.fn().mockReturnThis()
    }
    ProductModel.find.mockReturnValue(query)

    const res = mockRes()
    await getProducts({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('lists suppliers', async () => {
    SupplierModel.find.mockResolvedValue([
      { _id: 's-1', suppliersName: 'Proveedor UNO' }
    ])
    const res = mockRes()

    await getSuppliers({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('creates task with authenticated user', async () => {
    const res = mockRes()
    const saveSpy = vi.fn().mockResolvedValue({ _id: 't-1' })
    TaskModel.prototype.save = saveSpy
    TaskModel.prototype.populate = vi.fn().mockResolvedValue({
      _id: 't-1',
      title: 'Revisión',
      createdBy: 'u-1'
    })

    await createTask(
      {
        body: { title: 'Revisión', description: 'Verificar', priority: 'high' },
        user: { id: 'u-1' }
      },
      res
    )

    expect(saveSpy).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('lists tasks', async () => {
    TaskModel.find.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockResolvedValue([{ _id: 't-1' }])
    })

    const res = mockRes()
    await getTasks({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('creates type inventory', async () => {
    const res = mockRes()
    const saveSpy = vi
      .fn()
      .mockResolvedValue({ _id: 'ti-1', typeInventory: 'ENTRY' })
    TypeInventoryModel.prototype.save = saveSpy

    await createTypeInventory({ body: { typeInventory: 'ENTRY' } }, res)

    expect(saveSpy).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('lists type inventory', async () => {
    TypeInventoryModel.find.mockResolvedValue([
      { _id: 'ti-1', typeInventory: 'ENTRY' }
    ])
    const res = mockRes()

    await getTypeInventories({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('logs in user with valid password', async () => {
    const res = mockRes()
    UsersModel.findOne.mockResolvedValue({
      _id: 'u-1',
      username: 'admin',
      password: 'hash',
      isAdmin: true
    })
    bcrypt.compare.mockResolvedValue(true)

    await loginUser({ body: { username: 'admin', password: 'abc123' } }, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'test-token', username: 'admin' })
    )
  })

  it('lists users', async () => {
    const query = {
      select: vi.fn().mockResolvedValue([{ _id: 'u-1', username: 'admin' }])
    }
    UsersModel.find.mockReturnValue(query)
    const res = mockRes()

    await getUsers({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })
})
