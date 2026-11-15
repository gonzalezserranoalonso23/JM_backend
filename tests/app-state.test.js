import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.SECURITY_JM = 'app-state-secret'

let mongod
let app
let sudoToken
let staffToken

const sign = (user, role, tv = 0) =>
  jwt.sign(
    { id: String(user._id), username: user.username, role, tv },
    process.env.SECURITY_JM,
    { algorithm: 'HS256' }
  )

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri(), { dbName: 'jm_app_state' })
  app = (await import('../src/app.js')).default
  const Role = mongoose.model('Role')
  const User = mongoose.model('User')
  const [sudoRole, staffRole] = await Role.create([
    { name: 'Sudo' },
    { name: 'Staff' }
  ])
  const sudo = await User.create({
    username: 'glezalonso23',
    password: 'x',
    email: 'sudo@jm.test',
    role: sudoRole._id
  })
  const staff = await User.create({
    username: 'staff',
    password: 'x',
    email: 'staff@jm.test',
    role: staffRole._id
  })
  sudoToken = sign(sudo, 'Sudo')
  staffToken = sign(staff, 'Staff')
}, 120000)

afterAll(async () => {
  const { setShutdown } = await import('../src/modules/app-state/app-state.js')
  await setShutdown(false)
  await mongoose.disconnect()
  await mongod?.stop()
})

describe('apagado de la aplicación', () => {
  it('solo sudo apaga, cierra todas las sesiones y vuelve a activar', async () => {
    const open = await request(app).get('/api/app/status')
    expect(open.body).toEqual({ shutdown: false })

    const denied = await request(app)
      .post('/api/app/shutdown')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(denied.status).toBe(403)

    const closed = await request(app)
      .post('/api/app/shutdown')
      .set('Authorization', `Bearer ${sudoToken}`)
    expect(closed.status).toBe(200)
    expect(closed.body).toEqual({ shutdown: true })

    const kicked = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(kicked.status).toBe(401)
    expect(kicked.body.shutdown).toBe(true)

    const kickedSudo = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${sudoToken}`)
    expect(kickedSudo.status).toBe(401)
    expect(kickedSudo.body.shutdown).toBe(true)

    const closedStatus = await request(app).get('/api/app/status')
    expect(closedStatus.body).toEqual({ shutdown: true })

    const sudo = await mongoose.model('User').findOne({ username: 'glezalonso23' })
    const freshToken = sign(sudo, 'Sudo', sudo.tokenVersion)
    const started = await request(app)
      .post('/api/app/startup')
      .set('Authorization', `Bearer ${freshToken}`)
    expect(started.status).toBe(200)
    expect(started.body).toEqual({ shutdown: false })
  })

  it('el soporte deja pasar solo el nombre de un sudo', async () => {
    const empty = await request(app).post('/api/app/support').send({})
    expect(empty.status).toBe(400)
    expect(empty.body).toEqual({ message: 'El usuario es requerido' })

    const staff = await request(app)
      .post('/api/app/support')
      .send({ username: 'staff' })
    expect(staff.status).toBe(200)
    expect(staff.body).toEqual({ allowed: false })

    const sudo = await request(app)
      .post('/api/app/support')
      .send({ username: 'glezalonso23' })
    expect(sudo.status).toBe(200)
    expect(sudo.body).toEqual({ allowed: true })
  })
})
