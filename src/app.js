/**
 * HTTP application, without opening a port.
 * server.js connects to Mongo and listens. Tests import this file directly.
 * Routes are mounted by registerRoutes. Unknown paths and failures run after that,
 * in that order, so a missing route does not look like a server error.
 */
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import compression from 'compression'
import helmet from 'helmet'
import { registerRoutes } from './routes/index.js'
import { handleErrors, notFound } from './middleware/handleErrors.js'

const app = express()

dotenv.config({ quiet: true })
app.use(morgan('tiny'))
app.disable('x-powered-by')
// Behind a proxy, otherwise rate limit sees one IP.
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
registerRoutes(app)

app.use(notFound)
app.use(handleErrors)

export default app
