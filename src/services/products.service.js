import { CATEGORY_FIELDS, SUPPLIER_FIELDS } from '../utils/projections.js'
import ProductsModel from '../models/products.model.js'
import SuppliersModel from '../models/suppliers.model.js'
import CategoriesModel from '../models/categories.model.js'
import mongoose, { isValidObjectId } from 'mongoose'
import {
  accentInsensitiveRegex,
  createPaginatedResponse
} from '../utils/pagination.js'
import {
  foldText,
  productTokenMatch,
  searchTokens
} from '../utils/productSearch.js'

const project = (fields) =>
  Object.fromEntries(fields.split(' ').map((field) => [field, 1]))

const lookupStages = () => [
  {
    $lookup: {
      from: CategoriesModel.collection.name,
      localField: 'category',
      foreignField: '_id',
      pipeline: [{ $project: project(CATEGORY_FIELDS) }],
      as: 'category'
    }
  },
  {
    $lookup: {
      from: SuppliersModel.collection.name,
      localField: 'supplier',
      foreignField: '_id',
      pipeline: [{ $project: project(SUPPLIER_FIELDS) }],
      as: 'supplier'
    }
  },
  {
    $set: {
      category: { $ifNull: [{ $arrayElemAt: ['$category', 0] }, null] },
      supplier: { $ifNull: [{ $arrayElemAt: ['$supplier', 0] }, null] }
    }
  }
]

export const listProducts = async (queryParams = {}, pagination) => {
  const search = queryParams?.search?.trim()
  if (!search) {
    const query = ProductsModel.find()
      .populate('category', CATEGORY_FIELDS)
      .populate('supplier', SUPPLIER_FIELDS)
      .lean()

    if (!pagination.requested) return query

    const [data, total] = await Promise.all([
      query
        .sort({ productName: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      ProductsModel.countDocuments({})
    ])
    return createPaginatedResponse(data, total, pagination)
  }

  const tokens = searchTokens(search)
  if (!tokens.length) {
    return createPaginatedResponse([], 0, pagination)
  }

  const suppliers = await SuppliersModel.find(
    productTokenMatch(tokens, ['suppliersName']),
    { _id: 1 }
  ).lean()
  const supplierIds = suppliers.map((item) => item._id)
  const textMatch = productTokenMatch(tokens)
  const nameHit = {
    $and: tokens.map((token) => ({
      $regexMatch: {
        input: '$productName',
        regex: accentInsensitiveRegex(token),
        options: 'i'
      }
    }))
  }
  const match = supplierIds.length
    ? { $or: [textMatch, { supplier: { $in: supplierIds } }] }
    : textMatch

  const pageStages = pagination.requested
    ? [{ $skip: pagination.skip }, { $limit: pagination.limit }]
    : []
  const [result] = await ProductsModel.aggregate([
    { $match: match },
    { $addFields: { textHit: nameHit } },
    { $sort: { textHit: -1, productName: 1 } },
    {
      $facet: {
        meta: [{ $count: 'total' }],
        data: [...pageStages, ...lookupStages(), { $unset: 'textHit' }]
      }
    }
  ])
  const data = result?.data ?? []
  const total = result?.meta?.[0]?.total ?? 0
  return pagination.requested
    ? createPaginatedResponse(data, total, pagination)
    : data
}

const MIN_MARGIN = 30
const margin = {
  $round: [
    {
      $multiply: [
        {
          $divide: [
            { $subtract: ['$productPrice', '$purchasePrice'] },
            '$productPrice'
          ]
        },
        100
      ]
    },
    2
  ]
}

export const listPromotionProducts = async (queryParams = {}, pagination) => {
  const match = {
    isActive: { $ne: false },
    productPrice: { $gt: 0 },
    $expr: { $gte: [margin, MIN_MARGIN] }
  }

  const search =
    typeof queryParams?.search === 'string' ? queryParams.search.trim() : ''
  if (search) {
    const tokens = searchTokens(search)
    if (!tokens.length) {
      return pagination.requested
        ? createPaginatedResponse([], 0, pagination)
        : []
    }
    Object.assign(match, productTokenMatch(tokens))
  }

  const { category } = queryParams
  if (category) {
    if (!isValidObjectId(category)) {
      const error = new Error('Categoría inválida')
      error.status = 400
      throw error
    }
    match.category = new mongoose.Types.ObjectId(category)
  }

  const pageStages = pagination.requested
    ? [{ $skip: pagination.skip }, { $limit: pagination.limit }]
    : []
  const [result] = await ProductsModel.aggregate([
    { $match: match },
    { $addFields: { margin } },
    { $sort: { productName: 1 } },
    {
      $facet: {
        meta: [{ $count: 'total' }],
        data: [
          ...pageStages,
          {
            $lookup: {
              from: CategoriesModel.collection.name,
              localField: 'category',
              foreignField: '_id',
              pipeline: [{ $project: project(CATEGORY_FIELDS) }],
              as: 'category'
            }
          },
          {
            $set: {
              category: { $ifNull: [{ $arrayElemAt: ['$category', 0] }, null] }
            }
          }
        ]
      }
    }
  ])
  const data = result?.data ?? []
  const total = result?.meta?.[0]?.total ?? 0
  return pagination.requested
    ? createPaginatedResponse(data, total, pagination)
    : data
}

export const findProductLookup = async ({ search = '', active } = {}) => {
  const tokens = searchTokens(search)
  if (!tokens.length) return []

  const filter = productTokenMatch(tokens)
  if (active === '1') filter.isActive = { $ne: false }

  const rows = await ProductsModel.find(filter)
    .select({
      productName: 1,
      productDescription: 1,
      productStock: 1,
      purchasePrice: 1,
      productPrice: 1,
      category: 1,
      supplier: 1,
      isActive: 1
    })
    .limit(40)
    .lean()

  const ranked = rows.map((product) => {
    const name = foldText(product.productName)
    const inName = tokens.every((token) => name.includes(token))
    return { product, rank: inName ? 0 : 1, name }
  })
  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'es'))
  return ranked.map((item) => item.product).slice(0, 20)
}
