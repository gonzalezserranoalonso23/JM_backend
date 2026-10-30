import { describe, expect, it } from 'vitest'
import request from 'supertest'
import app from '../src/app.js'
import { handleErrors, normalizeError } from '../src/middlewares/handleErrors.js'

const mockRes = () => {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: null,
    redirected: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    redirect(code, location) {
      this.redirected = { code, location }
      return this
    }
  }
  return res
}

describe('handleErrors', () => {
  it('responde 404 en una ruta que no existe', async () => {
    const response = await request(app).get('/api/no-existe')
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      status: 404,
      message: 'Ruta no encontrada'
    })
  })

  it('responde 400 cuando el cuerpo no es JSON', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .send('{')
    expect(response.status).toBe(400)
    expect(response.body.message).toMatch(/JSON/)
  })

  it('redirige un 3xx que trae destino', () => {
    const res = mockRes()
    const error = new Error('movido')
    error.status = 302
    error.location = '/login'
    handleErrors(error, {}, res, () => {})
    expect(res.redirected).toEqual({ code: 302, location: '/login' })
  })

  it('conserva el detalle de un 400 de stock', () => {
    const error = new Error('Stock insuficiente de Agua')
    error.status = 400
    error.availableStock = 1
    error.productName = 'Agua'
    expect(normalizeError(error)).toMatchObject({
      status: 400,
      message: 'Stock insuficiente de Agua',
      availableStock: 1,
      productName: 'Agua'
    })
  })

  it('traduce validación, id inválido y duplicado', () => {
    const validation = new Error('validation')
    validation.name = 'ValidationError'
    validation.errors = { name: { message: 'El nombre es obligatorio' } }
    expect(normalizeError(validation)).toMatchObject({
      status: 400,
      message: 'El nombre es obligatorio'
    })

    const cast = new Error('cast')
    cast.name = 'CastError'
    expect(normalizeError(cast).status).toBe(400)

    expect(normalizeError({ code: 11000 }).status).toBe(409)
  })

  it('un error sin status queda en 500 sin filtrar el detalle interno', () => {
    const error = new Error('mongo explotó')
    expect(normalizeError(error)).toEqual({
      status: 500,
      message: 'Error del servidor'
    })
  })
})
