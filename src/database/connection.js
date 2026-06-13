import mongoose from 'mongoose'
import dotenv from 'dotenv'

 dotenv.config({ path: './.env' })
const connection = async () => {
  const db = await mongoose
    .connect(
      `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@cluster0.c1x9mou.mongodb.net/${process.env.MONGO_DB_NAME}?appName=Cluster0&retryWrites=true&w=majority`
    )
    .then((res) =>
      console.log(
        `Se ha conectado correctamente a la base de datos ${process.env.MONGO_DB_NAME}`
      )
    )
    .catch((err) =>
      console.log(
        `Ha ocurrido un error al conectarse a la base de datos ${err}`
      )
    )
}
export default connection
