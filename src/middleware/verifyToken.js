/**
 * Request gate. A route opts in by using verifyToken.
 * requireAdmin allows Sudo, Manager, and Supervisor. requireSudo allows Sudo only.
 * While the application is off, every role except Sudo is rejected.
 */
import jwt from 'jsonwebtoken'
import User from '../models/users.model.js'
import { grantsFullAccess, isSudo } from '../models/roles.model.js'
import { isApplicationActive } from '../models/appState.model.js'

const unauthorized = (res) =>
  res.status(401).json({
    message: 'Token inválido o expirado',
    ...(isApplicationActive() ? {} : { shutdown: true })
  })

const disconnected = (res) =>
  res.status(503).json({
    message: 'La aplicación está desconectada',
    shutdown: true
  })

// Checks signature, expiry, tokenVersion, and the current role.
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
        req.role = user.role?.name || ''
        if (!isApplicationActive() && !isSudo(req.role)) return disconnected(res)
        next()
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error al validar la sesión' })
      }
    }
  )
}

export const requireAdmin = (req, res, next) => {
  if (!grantsFullAccess(req.role)) {
    return res.status(403).json({ message: 'Acceso solo para administradores' })
  }
  next()
}

export const requireSudo = (req, res, next) => {
  if (!isSudo(req.role)) {
    return res.status(403).json({ message: 'Acceso solo para sudo' })
  }
  next()
}

export default verifyToken
