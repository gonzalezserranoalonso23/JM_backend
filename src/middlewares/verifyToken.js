import jwt from 'jsonwebtoken'
import User from '../modules/users/users.model.js'

const unauthorized = (res) =>
  res.status(401).json({ message: 'Token inválido o expirado' })

// Valida firma/expiración y confirma contra la BD que el usuario siga existiendo,
// que su sesión no haya sido cerrada (tokenVersion) y toma el rol vigente.
export const verifyToken = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token requerido' })
  }
  jwt.verify(
    token,
    process.env.SECURITY_JM,
    { algorithms: ['HS256'] },
    async (err, decoded) => {
      if (err) return unauthorized(res)
      try {
        const user = await User.findAuthState(decoded?.id)
        if (!user || (user.tokenVersion ?? 0) !== (decoded.tv ?? 0)) {
          return unauthorized(res)
        }
        req.user = decoded
        req.userId = decoded.id
        req.isAdmin = user.isAdmin === true
        next()
      } catch {
        res.status(500).json({ message: 'Error al validar la sesión' })
      }
    }
  )
}

export const requireAdmin = (req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({ message: 'Acceso solo para administradores' })
  }
  next()
}

export default verifyToken
