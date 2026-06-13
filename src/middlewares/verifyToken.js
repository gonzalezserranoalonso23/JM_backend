import jwt from 'jsonwebtoken'

const verifyToken = (req, res, next) => {
  const authorizationHeader = req.headers.authorization
  if (authorizationHeader !== undefined) {
    const token = authorizationHeader.split(' ')[1]
    jwt.verify(token, process.env.SECURITY_JM, (err, result) => {
      if (err)
        return res.status(404).json({ message: 'Error de autenticación' })

      next()
    })
  }
}

export default verifyToken
