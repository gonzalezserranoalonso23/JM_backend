import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn()
  }
}))

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'generated-token')
  }
}))

vi.mock('../src/modules/products/products.model.js', () => ({
  default: {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn()
  }
}))

vi.mock('../src/modules/daily-information/daily-information.model.js', () => ({
  default: {
    findOne: vi.fn()
  }
}))

vi.mock('../src/modules/type-inventory/type-inventory.model.js', () => ({
  default: {
    findById: vi.fn((id) =>
      Promise.resolve({
        _id: id,
        stockDirection: id === '507f1f77bcf86cd799439015' ? -1 : 1
      })
    )
  }
}))

vi.mock('../src/modules/payment-types/payment-types.model.js', () => ({
  default: {
    findById: vi.fn()
  }
}))

vi.mock('../src/modules/users/users.model.js', () => ({
  default: {
    findOne: vi.fn()
  }
}))

vi.mock('../src/modules/inventory-records/inventory-records.model.js', () => {
  class InventoryRecordMock {
    static instances = []

    constructor(data) {
      Object.assign(this, data)
      this.save = vi.fn().mockResolvedValue({
        ...data,
        _id: 'record-123'
      })
      InventoryRecordMock.instances.push(this)
    }
  }

  InventoryRecordMock.findById = vi.fn()
  InventoryRecordMock.find = vi.fn()

  return { default: InventoryRecordMock }
})

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Product from '../src/modules/products/products.model.js'
import InventoryRecordModel from '../src/modules/inventory-records/inventory-records.model.js'
import DailyInformation from '../src/modules/daily-information/daily-information.model.js'
import UserModel from '../src/modules/users/users.model.js'
import {
  createInventoryRecord,
  getDailySalesSummary,
  getLowStockProducts,
  getInventoryStats
} from '../src/modules/inventory-records/inventory-records.controller.js'
import { loginUser } from '../src/modules/users/users.controller.js'

const ENTRY_TYPE_ID = '507f1f77bcf86cd799439014'
const ISSUE_TYPE_ID = '507f1f77bcf86cd799439015'

const mockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
})

const mockChainedPopulate = (record) => {
  const result = Promise.resolve(record)
  const query = {
    populate: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    then: result.then.bind(result),
    catch: result.catch.bind(result)
  }
  return query
}

describe('Business logic tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs in a valid user and returns a JWT', async () => {
    const res = mockRes()

    UserModel.findOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439013',
      username: 'admin',
      password: 'hashed-pass',
      isAdmin: true
    })
    bcrypt.compare.mockResolvedValue(true)

    await loginUser(
      {
        body: {
          username: 'admin',
          password: 'secret123'
        }
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(jwt.sign).toHaveBeenCalledWith(
      {
        id: '507f1f77bcf86cd799439013',
        username: 'admin',
        isAdmin: true,
        tv: 0
      },
      process.env.SECURITY_JM,
      { expiresIn: '7d', algorithm: 'HS256' }
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'generated-token',
        username: 'admin',
        isAdmin: true
      })
    )
  })

  it('rejects an inventory issue when the stock is insufficient', async () => {
    const res = mockRes()

    Product.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 2,
      productPrice: 25
    })

    await createInventoryRecord(
      {
        body: {
          date: '2026-09-03',
          typeInventory: ISSUE_TYPE_ID,
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 25,
          quantity: 5,
          totalAmount: 125
        },
        user: { id: '507f1f77bcf86cd799439013' }
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Stock insuficiente',
        availableStock: 2,
        requestedQuantity: 5
      })
    )
  })

  it('adds stock when creating an ENTRY inventory record', async () => {
    const res = mockRes()
    const populatedRecord = {
      _id: 'record-123',
      date: '2026-09-03',
      typeInventory: { _id: ENTRY_TYPE_ID, stockDirection: 1 },
      productName: {
        _id: '507f1f77bcf86cd799439011',
        productName: 'Coca-Cola'
      },
      category: { _id: '507f1f77bcf86cd799439012', name: 'Bebidas' },
      productPrice: 18,
      quantity: 7,
      totalAmount: 126,
      User: { _id: '507f1f77bcf86cd799439013', username: 'admin' }
    }

    Product.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 10,
      productPrice: 18
    })
    Product.findOneAndUpdate.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 17
    })
    InventoryRecordModel.findById.mockReturnValue(
      mockChainedPopulate(populatedRecord)
    )
    InventoryRecordModel.instances = []

    await createInventoryRecord(
      {
        body: {
          date: '2026-09-03',
          typeInventory: ENTRY_TYPE_ID,
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 18,
          quantity: 7,
          totalAmount: 126
        },
        user: { id: '507f1f77bcf86cd799439013' }
      },
      res
    )

    expect(InventoryRecordModel.instances[0].save).toHaveBeenCalled()
    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011' },
      [
        {
          $set: {
            productStock: { $round: [{ $add: ['$productStock', 7] }, 3] }
          }
        }
      ],
      { returnDocument: 'after', updatePipeline: true }
    )
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        typeInventory: expect.objectContaining({
          _id: ENTRY_TYPE_ID,
          stockDirection: 1
        }),
        quantity: 7,
        User: expect.objectContaining({ _id: '507f1f77bcf86cd799439013' })
      })
    )
  })

  it('subtracts stock and updates daily sales when creating an ISSUE inventory record', async () => {
    const res = mockRes()
    const populatedRecord = {
      _id: 'record-124',
      date: '2026-09-03',
      typeInventory: { _id: ISSUE_TYPE_ID, stockDirection: -1 },
      productName: {
        _id: '507f1f77bcf86cd799439011',
        productName: 'Coca-Cola'
      },
      category: { _id: '507f1f77bcf86cd799439012', name: 'Bebidas' },
      productPrice: 25,
      quantity: 3,
      totalAmount: 75,
      User: { _id: '507f1f77bcf86cd799439013', username: 'admin' }
    }

    Product.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 12,
      productPrice: 25
    })
    Product.findOneAndUpdate.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 9
    })
    InventoryRecordModel.findById.mockReturnValue(
      mockChainedPopulate(populatedRecord)
    )
    InventoryRecordModel.instances = []

    await createInventoryRecord(
      {
        body: {
          date: '2026-09-03',
          typeInventory: ISSUE_TYPE_ID,
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 25,
          quantity: 3,
          totalAmount: 75
        },
        user: { id: '507f1f77bcf86cd799439013' }
      },
      res
    )

    expect(InventoryRecordModel.instances[0].save).toHaveBeenCalled()
    expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799439011', productStock: { $gte: 3 } },
      [
        {
          $set: {
            productStock: { $round: [{ $add: ['$productStock', -3] }, 3] }
          }
        }
      ],
      { returnDocument: 'after', updatePipeline: true }
    )
    expect(DailyInformation.findOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('summarizes only ISSUE records as daily sales', async () => {
    const res = mockRes()
    InventoryRecordModel.find.mockReturnValue(
      mockChainedPopulate([
        { typeInventory: { stockDirection: 1 }, totalAmount: 100 },
        { typeInventory: { stockDirection: -1 }, totalAmount: 35 },
        { typeInventory: { stockDirection: -1 }, totalAmount: '15.50' }
      ])
    )

    await getDailySalesSummary({ query: { date: '2026-09-03' } }, res)

    expect(InventoryRecordModel.find).toHaveBeenCalledWith({
      date: { $regex: '2026-09-03' }
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-09-03',
        totalSales: 50.5,
        totalTransactions: 2,
        productsSold: 2
      })
    )
  })

  it('calculates inventory statistics from products and movements', async () => {
    const res = mockRes()
    Product.find.mockReturnValue(
      mockChainedPopulate([
        { productStock: 10, productPrice: 4, minimumProductStock: 5 },
        { productStock: 2, productPrice: 20, minimumProductStock: 3 },
        { productStock: 0, productPrice: 8, minimumProductStock: 1 },
        { productStock: 5, productPrice: 1, minimumProductStock: 5 }
      ])
    )
    InventoryRecordModel.find.mockReturnValue(
      mockChainedPopulate([
        { typeInventory: { stockDirection: 1 }, totalAmount: 40 },
        { typeInventory: { stockDirection: -1 }, totalAmount: '12.50' },
        { typeInventory: { stockDirection: -1 }, totalAmount: 7.5 }
      ])
    )

    await getInventoryStats({}, res)

    expect(Product.find).toHaveBeenCalledWith(
      { isActive: { $ne: false } },
      expect.any(String)
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      totalProducts: 4,
      totalInventoryValue: 85,
      lowStockProducts: 2,
      outOfStockProducts: 1,
      totalSalesValue: 20,
      totalMovements: 3
    })
  })

  it('lists only products below their minimum stock', async () => {
    const query = {
      populate: vi.fn().mockReturnThis(),
      then: (resolve) => Promise.resolve([]).then(resolve)
    }
    Product.find.mockReturnValue(query)
    const res = mockRes()

    await getLowStockProducts({ query: {} }, res)

    expect(Product.find).toHaveBeenCalledWith({
      isActive: { $ne: false },
      $expr: { $lt: ['$productStock', '$minimumProductStock'] }
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })
})

describe('Seguridad del login', () => {
  it('el token dura 7 días y usa HS256', async () => {
    const res = mockRes()
    UserModel.findOne.mockResolvedValue({
      _id: '507f1f77bcf86cd799439013',
      username: 'admin',
      password: 'hashed-pass',
      isAdmin: false
    })
    bcrypt.compare.mockResolvedValue(true)
    await loginUser(
      { body: { username: 'admin', password: 'x', remember: true } },
      res
    )
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.any(Object),
      process.env.SECURITY_JM,
      { expiresIn: '7d', algorithm: 'HS256' }
    )
  })

  it('rechaza username que no es texto (inyección de operadores)', async () => {
    const res = mockRes()
    await loginUser(
      { body: { username: { $regex: '^a' }, password: 'x' } },
      res
    )
    expect(res.status).toHaveBeenCalledWith(400)
  })
})
