import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'

process.env.SECURITY_JM = 'app-state-secret'
process.env.Railway_Activate = '170215'

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
  const { setApplicationActive } = await import(
    '../src/models/appState.model.js'
  )
  await setApplicationActive(true)
  await mongoose.disconnect()
  await mongod?.stop()
})

describe('apagado de la aplicación', () => {
  it('solo sudo apaga, cierra todas las sesiones y vuelve a activar', async () => {
    const open = await request(app).get('/api/app/status')
    expect(open.body).toEqual({ active: true, shutdown: false })

    const denied = await request(app)
      .post('/api/app/shutdown')
      .set('Authorization', `Bearer ${staffToken}`)
    expect(denied.status).toBe(403)

    const closed = await request(app)
      .post('/api/app/shutdown')
      .set('Authorization', `Bearer ${sudoToken}`)
    expect(closed.status).toBe(200)
    expect(closed.body).toEqual({ active: false, shutdown: true })

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
    expect(closedStatus.body).toEqual({ active: false, shutdown: true })

    const sudo = await mongoose.model('User').findOne({ username: 'glezalonso23' })
    const freshToken = sign(sudo, 'Sudo', sudo.tokenVersion)
    const started = await request(app)
      .post('/api/app/startup')
      .set('Authorization', `Bearer ${freshToken}`)
    expect(started.status).toBe(200)
    expect(started.body).toEqual({ active: true, shutdown: false })
  })

  it('el código railway abre el login y un código distinto no', async () => {
    const empty = await request(app).post('/api/app/support').send({})
    expect(empty.status).toBe(400)
    expect(empty.body).toEqual({ message: 'El código es requerido' })

    const wrong = await request(app)
      .post('/api/app/support')
      .send({ code: '000000' })
    expect(wrong.status).toBe(200)
    expect(wrong.body).toEqual({ allowed: false })

    const right = await request(app)
      .post('/api/app/support')
      .send({ code: '170215' })
    expect(right.status).toBe(200)
    expect(right.body).toEqual({ allowed: true })
  })

  it('apagada, el login es público y solo el sudo entra sin encenderla', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const { setApplicationActive } = await import(
      '../src/models/appState.model.js'
    )
    await setApplicationActive(false)
    const password = await bcrypt.hash('secreto1', 4)
    await mongoose.model('User').updateMany({}, { password })

    const status = await request(app).get('/api/app/status')
    expect(status.status).toBe(200)
    expect(status.body).toEqual({ active: false, shutdown: true })

    const support = await request(app)
      .post('/api/app/support')
      .send({ code: '170215' })
    expect(support.status).toBe(200)
    expect(support.body.allowed).toBe(true)

    expect((await request(app).post('/api/app/shutdown')).status).toBe(401)
    expect((await request(app).post('/api/app/startup')).status).toBe(401)

    const staffLogin = await request(app)
      .post('/api/users/login')
      .send({ username: 'staff', password: 'secreto1' })
    expect(staffLogin.status).toBe(503)
    expect(staffLogin.body.token).toBeUndefined()
    expect(staffLogin.body.message).toBe(
      'Solo un Sudo puede entrar con la aplicación desconectada'
    )

    const sudoLogin = await request(app)
      .post('/api/users/login')
      .send({ username: 'glezalonso23', password: 'secreto1' })
    expect(sudoLogin.status).toBe(200)
    expect(sudoLogin.body.role).toBe('Sudo')
    expect(sudoLogin.body.shutdown).toBe(true)
    expect(typeof sudoLogin.body.token).toBe('string')

    const stillOff = await request(app).get('/api/app/status')
    expect(stillOff.body).toEqual({ active: false, shutdown: true })

    const started = await request(app)
      .post('/api/app/startup')
      .set('Authorization', `Bearer ${sudoLogin.body.token}`)
    expect(started.status).toBe(200)
    expect(started.body).toEqual({ active: true, shutdown: false })

    const staffAfter = await request(app)
      .post('/api/users/login')
      .send({ username: 'staff', password: 'secreto1' })
    expect(staffAfter.status).toBe(200)
    expect(staffAfter.body.role).toBe('Staff')
  })
})
