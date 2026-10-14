import app from './app.js'
import connection from './database/connection.js'

if (!process.env.SECURITY_JM) {
  console.error('SECURITY_JM debe estar definido')
  process.exit(1)
}
if (process.env.SECURITY_JM.length < 32) {
  console.warn('Aviso: SECURITY_JM es corto, se recomiendan 32+ caracteres')
}

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
