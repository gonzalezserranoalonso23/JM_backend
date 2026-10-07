import app from './app.js'
import connection from './database/connection.js'

connection()
  .then(() => {
    app.listen(app.get('port'), '0.0.0.0', () =>
      console.log(
        `${app.get('title')} esta corriendo por el puerto: ${app.get('port')}`
      )
    )
  })
  .catch((error) => {
    console.error(`No se pudo conectar a la base de datos: ${error.message}`)
    process.exit(1)
  })
