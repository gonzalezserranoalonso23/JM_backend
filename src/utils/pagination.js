export const getPagination = (query = {}) => {
  const requested =
    query.page !== undefined ||
    query.limit !== undefined ||
    query.search !== undefined
  if (!requested) return { requested: false }

  const page = Number(query.page ?? 1)
  const requestedLimit = Number(query.limit ?? 20)
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1
  ) {
    return { error: 'page y limit deben ser enteros mayores que cero' }
  }

  const limit = Math.min(requestedLimit, 100)
  return { requested: true, page, limit, skip: (page - 1) * limit }
}

export const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const createPaginatedResponse = (data, total, pagination) => ({
  data,
  page: pagination.page,
  limit: pagination.limit,
  total,
  totalPages: Math.ceil(total / pagination.limit),
  hasNextPage: pagination.page * pagination.limit < total
})
