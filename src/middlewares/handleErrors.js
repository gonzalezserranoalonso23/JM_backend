// Último middleware de Express. Cualquier error que llegue aquí sale
// con el mismo formato, incluido un 3xx cuando trae a dónde redirigir.
const PUBLIC_FIELDS = [
  'availableStock',
  'requestedQuantity',
  'productName',
  'failedAt'
]

const STATUS_MESSAGES = {
  400: 'La solicitud no es válida',
  401: 'Token inválido o expirado',
  403: 'No tienes permiso para esta acción',
  404: 'No se encontró lo que buscabas',
  409: 'Esa acción entra en conflicto con datos que ya existen',
  413: 'La solicitud es demasiado grande',
  429: 'Demasiados intentos. Espera un momento.'
}

const withPublicFields = (source, target) => {
  for (const field of PUBLIC_FIELDS) {
    if (source?.[field] !== undefined) target[field] = source[field]
  }
  return target
}

export const normalizeError = (err) => {
  if (!err) return { status: 500, message: 'Error del servidor' }

  if (err.status >= 300 && err.status < 400) {
    return {
      status: err.status,
      message: err.message || 'El recurso se movió',
      location: err.location,
      redirect: Boolean(err.location)
    }
  }

  if (
    err.type === 'entity.parse.failed' ||
    err.type === 'entity.too.large' ||
    (err instanceof SyntaxError && err.status === 400)
  ) {
    const tooLarge = err.type === 'entity.too.large' || err.status === 413
    return {
      status: tooLarge ? 413 : 400,
      message: tooLarge
        ? STATUS_MESSAGES[413]
        : 'El cuerpo de la solicitud no es JSON válido'
    }
  }

  if (err.name === 'ValidationError') {
    const message =
      Object.values(err.errors || {})
        .map((item) => item.message)
        .filter(Boolean)
        .join(', ') || STATUS_MESSAGES[400]
    return { status: 400, message }
  }

  if (err.name === 'CastError') {
    return { status: 400, message: 'Identificador o dato con formato inválido' }
  }

  if (err.code === 11000) {
    return { status: 409, message: STATUS_MESSAGES[409] }
  }

  if (err.status === 413) {
    return { status: 413, message: STATUS_MESSAGES[413] }
  }

  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
    return withPublicFields(err, {
      status: err.status,
      message: err.message || STATUS_MESSAGES[err.status] || 'Error del servidor'
    })
  }

  return { status: 500, message: 'Error del servidor' }
}

export const notFound = (req, res, next) => {
  const error = new Error('Ruta no encontrada')
  error.status = 404
  next(error)
}

export const handleErrors = (err, req, res, next) => {
  if (res.headersSent) return next(err)

  const normalized = normalizeError(err)
  if (normalized.redirect) {
    return res.redirect(normalized.status, normalized.location)
  }

  const payload = withPublicFields(normalized, {
    message: normalized.message,
    status: normalized.status
  })

  if (process.env.NODE_ENV === 'development' && normalized.status >= 500) {
    payload.error = err?.message
  }

  res.status(normalized.status).json(payload)
}
