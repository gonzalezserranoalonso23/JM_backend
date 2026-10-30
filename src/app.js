import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import compression from 'compression'
import helmet from 'helmet'

const app = express()

import usersRouter from './modules/users/users.routes.js'
import categoriesRouter from './modules/categories/categories.routes.js'
import suppliersRouter from './modules/suppliers/suppliers.routes.js'
import productsRouter from './modules/products/products.routes.js'
import typeInventoryRouter from './modules/type-inventory/type-inventory.routes.js'
import paymentTypesRouter from './modules/payment-types/payment-types.routes.js'
import inventoryRecordsRouter from './modules/inventory-records/inventory-records.routes.js'
import dailyInformationRouter from './modules/daily-information/daily-information.routes.js'
import ordersRouter from './modules/orders/orders.routes.js'
import tasksRouter from './modules/tasks/tasks.routes.js'
import pushNotificationsRouter from './modules/push-notifications/push-notifications.routes.js'
import denominationsRouter from './modules/denominations/denominations.routes.js'
import { handleErrors, notFound } from './middlewares/handleErrors.js'

dotenv.config()
app.use(morgan('tiny'))
app.disable('x-powered-by')
// Railway/Vercel van detrás de un proxy: sin esto el rate limit ve una sola IP
app.set('trust proxy', 1)
app.use(helmet())
app.use(compression())
app.use(express.json({ limit: '1mb' }))
const allowedOrigins = [
  process.env.CLIENT,
  process.env.DEV,
  process.env.DEV_MOBILE
]
  .filter(Boolean)
  .map((origin) => origin.trim().replace(/\/+$/, ''))
const corsOptions = {
  origin: allowedOrigins,
  credentials: true
}
app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions))

app.set('title', 'MiscelaniaJM')
app.set('port', process.env.PORT || 3000)
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }))
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Bienvenido a la API de MiscelaniaJM' })
})
app.use('/api/users', usersRouter)
app.use('/api/type-inventory', typeInventoryRouter)
app.use('/api/payment-types', paymentTypesRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/suppliers', suppliersRouter)
app.use('/api/products', productsRouter)
app.use('/api/inventory-records', inventoryRecordsRouter)
app.use('/api/daily-information', dailyInformationRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/push', pushNotificationsRouter)
app.use('/api/denominations', denominationsRouter)

app.use(notFound)
app.use(handleErrors)

export default app
