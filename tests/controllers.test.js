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

vi.mock('../src/modules/categories/categories.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/modules/daily-information/daily-information.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn()
  })
}))

vi.mock('../src/modules/products/products.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/modules/orders/orders.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn()
  })
}))

vi.mock('../src/modules/suppliers/suppliers.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/modules/type-inventory/type-inventory.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  })
}))

vi.mock('../src/modules/push-notifications/push.service.js', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../src/modules/tasks/tasks.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn()
  })
}))

vi.mock('../src/modules/users/users.model.js', () => ({
  default: makeModel({
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    exists: vi.fn()
  })
}))

import bcrypt from 'bcryptjs'
import CategoriesModel from '../src/modules/categories/categories.model.js'
import {
  getCategories,
  createCategory
} from '../src/modules/categories/categories.controller.js'
import {
  getDailyInformations,
  createDailyInformation
} from '../src/modules/daily-information/daily-information.controller.js'
import {
  createInventoryRecord,
  getInventoryRecords
} from '../src/modules/inventory-records/inventory-records.controller.js'
import { getOrders } from '../src/modules/orders/orders.controller.js'
import {
  createProduct,
  getProducts
} from '../src/modules/products/products.controller.js'
import { getSuppliers } from '../src/modules/suppliers/suppliers.controller.js'
import { createTask, getTasks } from '../src/modules/tasks/tasks.controller.js'
import { sendPushToUser } from '../src/modules/push-notifications/push.service.js'
import {
  createTypeInventory,
  getTypeInventories
} from '../src/modules/type-inventory/type-inventory.controller.js'
import { getUsers, loginUser } from '../src/modules/users/users.controller.js'
import UsersModel from '../src/modules/users/users.model.js'
import ProductModel from '../src/modules/products/products.model.js'
import InventoryRecord from '../src/modules/inventory-records/inventory-records.model.js'
import OrderModel from '../src/modules/orders/orders.model.js'
import SupplierModel from '../src/modules/suppliers/suppliers.model.js'
import TypeInventoryModel from '../src/modules/type-inventory/type-inventory.model.js'
import TaskModel from '../src/modules/tasks/tasks.model.js'
import DailyInformationModel from '../src/modules/daily-information/daily-information.model.js'

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
    DailyInformationModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'd-1' }])
    })

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
          totalAmount: 30
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
      select: vi.fn().mockReturnThis(),
      sort: vi.fn().mockResolvedValue([{ _id: 'r-1' }])
    })

    await getInventoryRecords({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('lists orders', async () => {
    OrderModel.find.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'o-1' }])
    })

    const res = mockRes()
    await getOrders({}, res)

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
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'p-1' }])
    }
    ProductModel.find.mockReturnValue(query)

    const res = mockRes()
    await getProducts({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(query.lean).toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith([{ _id: 'p-1' }])
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
    expect(sendPushToUser).not.toHaveBeenCalled()
  })

  it('notifies only the assigned user when a pending task is created', async () => {
    const res = mockRes()
    const assigneeId = '507f1f77bcf86cd799439011'
    UsersModel.exists.mockResolvedValue({ _id: assigneeId })
    TaskModel.prototype.save = vi.fn().mockResolvedValue({ _id: 't-2' })
    TaskModel.prototype.populate = vi.fn().mockResolvedValue({
      _id: 't-2',
      title: 'Reponer leche',
      assignedTo: { _id: assigneeId }
    })

    await createTask(
      {
        body: {
          title: 'Reponer leche',
          assignedTo: assigneeId
        },
        user: { id: 'u-admin' }
      },
      res
    )

    expect(sendPushToUser).toHaveBeenCalledWith(
      assigneeId,
      expect.objectContaining({
        title: 'Pendiente asignado',
        body: 'Reponer leche',
        url: '/todolist'
      })
    )
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('lists tasks', async () => {
    TaskModel.find.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 't-1' }])
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
    TypeInventoryModel.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'ti-1', typeInventory: 'ENTRY' }])
    })
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
