import jwt from 'jsonwebtoken'

const verifyToken = (req, res, next) => {
  const authorizationHeader = req.headers.authorization
  if (!authorizationHeader) {
    return res.status(401).json({ message: 'Token requerido' })
  }
  const token = authorizationHeader.split(' ')[1]
  jwt.verify(token, process.env.SECURITY_JM, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Token inválido o expirado' })
    }
    req.user = decoded
    req.userId = decoded?.id
    next()
  })
}

export default verifyToken
