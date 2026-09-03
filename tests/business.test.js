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

vi.mock('../src/models/Products.models.js', () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    find: vi.fn()
  }
}))

vi.mock('../src/models/DailyInformation.models.js', () => ({
  default: {
    findOne: vi.fn()
  }
}))

vi.mock('../src/models/Users.models.js', () => ({
  default: {
    findOne: vi.fn()
  }
}))

vi.mock('../src/models/InventoryRecord.models.js', () => {
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
import Product from '../src/models/Products.models.js'
import InventoryRecordModel from '../src/models/InventoryRecord.models.js'
import DailyInformation from '../src/models/DailyInformation.models.js'
import UserModel from '../src/models/Users.models.js'
import {
  createInventoryRecord,
  getDailySalesSummary,
  getInventoryStats
} from '../src/controllers/InventoryRecord.controllers.js'
import { loginUser } from '../src/controllers/Users.controllers.js'

const mockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
})

const mockChainedPopulate = (record) => ({
  populate: vi.fn().mockImplementation(() => ({
    populate: vi.fn().mockImplementation(() => ({
      populate: vi.fn().mockResolvedValue(record)
    }))
  }))
})

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
      { id: '507f1f77bcf86cd799439013', username: 'admin' },
      process.env.SECURITY_JM,
      { expiresIn: '7d' }
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
          typeInventory: 'ISSUE',
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 25,
          quantity: 5,
          totalAmount: 125,
          Observations: 'venta'
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
      typeInventory: 'ENTRY',
      productName: {
        _id: '507f1f77bcf86cd799439011',
        productName: 'Coca-Cola'
      },
      category: { _id: '507f1f77bcf86cd799439012', name: 'Bebidas' },
      productPrice: 18,
      quantity: 7,
      totalAmount: 126,
      Observations: 'Compra',
      User: { _id: '507f1f77bcf86cd799439013', username: 'admin' }
    }

    Product.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 10,
      productPrice: 18
    })
    Product.findByIdAndUpdate.mockResolvedValue({
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
          typeInventory: 'ENTRY',
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 18,
          quantity: 7,
          totalAmount: 126,
          Observations: 'Compra'
        },
        user: { id: '507f1f77bcf86cd799439013' }
      },
      res
    )

    expect(InventoryRecordModel.instances[0].save).toHaveBeenCalled()
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { productStock: 17 },
      { new: true }
    )
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        typeInventory: 'ENTRY',
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
      typeInventory: 'ISSUE',
      productName: {
        _id: '507f1f77bcf86cd799439011',
        productName: 'Coca-Cola'
      },
      category: { _id: '507f1f77bcf86cd799439012', name: 'Bebidas' },
      productPrice: 25,
      quantity: 3,
      totalAmount: 75,
      Observations: 'venta',
      User: { _id: '507f1f77bcf86cd799439013', username: 'admin' }
    }

    Product.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 12,
      productPrice: 25
    })
    Product.findByIdAndUpdate.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      productStock: 9
    })
    InventoryRecordModel.findById.mockReturnValue(
      mockChainedPopulate(populatedRecord)
    )
    DailyInformation.findOne.mockResolvedValue({
      date: '2026-09-03',
      totalSales: 0,
      totalTransactions: 0,
      save: vi.fn().mockResolvedValue(true)
    })
    InventoryRecordModel.instances = []

    await createInventoryRecord(
      {
        body: {
          date: '2026-09-03',
          typeInventory: 'ISSUE',
          productName: '507f1f77bcf86cd799439011',
          category: '507f1f77bcf86cd799439012',
          productPrice: 25,
          quantity: 3,
          totalAmount: 75,
          Observations: 'venta'
        },
        user: { id: '507f1f77bcf86cd799439013' }
      },
      res
    )

    expect(InventoryRecordModel.instances[0].save).toHaveBeenCalled()
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      { productStock: 9 },
      { new: true }
    )
    expect(DailyInformation.findOne).toHaveBeenCalledWith({
      date: '2026-09-03'
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('summarizes only ISSUE records as daily sales', async () => {
    const res = mockRes()
    InventoryRecordModel.find.mockReturnValue({
      populate: vi.fn().mockResolvedValue([
        { typeInventory: 'ENTRY', totalAmount: 100 },
        { typeInventory: 'ISSUE', totalAmount: 35 },
        { typeInventory: 'VENTA', totalAmount: '15.50' }
      ])
    })

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
    Product.find.mockResolvedValue([
      { productStock: 10, productPrice: 4, minimumProductStock: 5 },
      { productStock: 2, productPrice: 20, minimumProductStock: 3 },
      { productStock: 0, productPrice: 8, minimumProductStock: 1 }
    ])
    InventoryRecordModel.find.mockResolvedValue([
      { typeInventory: 'ENTRY', totalAmount: 40 },
      { typeInventory: 'ISSUE', totalAmount: '12.50' },
      { typeInventory: 'VENTA', totalAmount: 7.5 }
    ])

    await getInventoryStats({}, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      totalProducts: 3,
      totalInventoryValue: 80,
      lowStockProducts: 2,
      outOfStockProducts: 1,
      totalSalesValue: 20,
      totalMovements: 3
    })
  })
})
