import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import compression from 'compression'
import helmet from 'helmet'

const app = express()

// Routes
import userRouter from './modules/users/users.routes.js'
import CategoriesRouter from './modules/categories/categories.routes.js'
import SuppliersRouter from './modules/suppliers/suppliers.routes.js'
import ProductsRouter from './modules/products/products.routes.js'
import typeInventory from './modules/type-inventory/type-inventory.routes.js'
import paymentType from './modules/payment-types/payment-types.routes.js'
import InventoryRecordsRouter from './modules/inventory-records/inventory-records.routes.js'
import DailyInformationRouter from './modules/daily-information/daily-information.routes.js'
import OrdersRouter from './modules/orders/orders.routes.js'
import TasksRouter from './modules/tasks/tasks.routes.js'

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
app.use('/api/users', userRouter)
app.use('/api/type-inventory', typeInventory)
app.use('/api/payment-types', paymentType)
app.use('/api/categories', CategoriesRouter)
app.use('/api/suppliers', SuppliersRouter)
app.use('/api/products', ProductsRouter)
app.use('/api/inventory-records', InventoryRecordsRouter)
app.use('/api/daily-information', DailyInformationRouter)
app.use('/api/orders', OrdersRouter)
app.use('/api/tasks', TasksRouter)

export default app
