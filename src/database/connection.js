import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { ensureRoles } from '../modules/roles/roles.model.js'
import { dropLegacyAdminFlag } from '../modules/users/users.model.js'

dotenv.config()

// Atlas uses MONGODB_URI. Loose variables stay for older environments.
export const getMongoUri = () => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const { MONGO_USER, MONGO_PASSWORD, MONGO_DB_NAME } = process.env
  return `mongodb+srv://${MONGO_USER}:${MONGO_PASSWORD}@cluster0.c1x9mou.mongodb.net/${MONGO_DB_NAME}?appName=Cluster0&retryWrites=true&w=majority`
}

const connection = async () => {
  await mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 15000 })
  await ensureRoles()
  await dropLegacyAdminFlag()
  console.log(
    `Se ha conectado correctamente a la base de datos ${mongoose.connection.name}`
  )
}
export default connection
