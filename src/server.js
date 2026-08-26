import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import compression from 'compression'
import connection from './database/connection.js'

const app = express()

// Routes
import userRouter from './routes/Users.routes.js'
import CategoriesRouter from './routes/Categories.routes.js'
import SuppliersRouter from './routes/Suppliers.routes.js'
import ProductsRouter from './routes/Products.routes.js'
import typeInventory from './routes/TypeInventory.routes.js'
import InventoryRecordsRouter from './routes/InventoryRecord.routes.js'
import PaymentsTypeRouter from './routes/PaymentsType.routes.js'
import DailyInformationRouter from './routes/DailyInformation.routes.js'
import OrdersRouter from './routes/Orders.routes.js'
import TasksRouter from './routes/Tasks.routes.js'

dotenv.config('./.env')
app.use(morgan('tiny'))
app.disable('x-powered-by')
app.use(compression())
app.use(express.json())
const allowedOrigins = [
  process.env.CLIENT,
  process.env.DEV,
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
)

app.set('title', 'MiscelaniaJM')
app.set('port', process.env.PORT || 3000)
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Bienvenido a la API de MiscelaniaJM' })
})
app.use('/api/users', userRouter)
app.use('/api/type-inventory', typeInventory)
app.use('/api/categories', CategoriesRouter)
app.use('/api/suppliers', SuppliersRouter)
app.use('/api/products', ProductsRouter)
app.use('/api/inventory-records', InventoryRecordsRouter)
app.use('/api/payment-types', PaymentsTypeRouter)
app.use('/api/daily-information', DailyInformationRouter)
app.use('/api/orders', OrdersRouter)
app.use('/api/tasks', TasksRouter)

connection()
  .then(() => {
    try {
      app.listen(app.get('port'), () =>
        console.log(
          `${app.get('title')} esta corriendo por el puerto: ${app.get('port')}`
        )
      )
    } catch (error) {
      console.log('No se podido acceder al servidor')
    }
  })
  .catch((error) =>
    console.log(`El servidor no se pudo conectar a la base de datos ${error}`)
  )
