import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

// En Atlas se usa MONGODB_URI (mongodb+srv://...). Las variables sueltas se
// mantienen para no romper entornos existentes.
export const getMongoUri = () => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const { MONGO_USER, MONGO_PASSWORD, MONGO_DB_NAME } = process.env
  return `mongodb+srv://${MONGO_USER}:${MONGO_PASSWORD}@cluster0.c1x9mou.mongodb.net/${MONGO_DB_NAME}?appName=Cluster0&retryWrites=true&w=majority`
}

const connection = async () => {
  await mongoose.connect(getMongoUri(), { serverSelectionTimeoutMS: 15000 })
  console.log(
    `Se ha conectado correctamente a la base de datos ${mongoose.connection.name}`
  )
}
export default connection
