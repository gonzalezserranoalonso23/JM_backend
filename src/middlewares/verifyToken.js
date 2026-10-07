import jwt from 'jsonwebtoken'

export const verifyToken = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token requerido' })
  }
  jwt.verify(token, process.env.SECURITY_JM, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: 'Token inválido o expirado' })
    }
    req.user = decoded
    req.userId = decoded?.id
    req.isAdmin = decoded?.isAdmin === true
    next()
  })
}

export const requireAdmin = (req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({ message: 'Acceso solo para administradores' })
  }
  next()
}

export default verifyToken
