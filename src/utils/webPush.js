import crypto from 'crypto'
import webPush from 'web-push'

let configured = false

const decodeKey = (value) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null
  try {
    const padding = '='.repeat((4 - (trimmed.length % 4)) % 4)
    return Buffer.from(
      trimmed.replace(/-/g, '+').replace(/_/g, '/') + padding,
      'base64'
    )
  } catch {
    return null
  }
}

const pairMatches = (publicKey, privateKey) => {
  try {
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.setPrivateKey(privateKey)
    return ecdh.getPublicKey().equals(publicKey)
  } catch {
    return false
  }
}

export const readVapidKeys = () => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = String(
    process.env.VAPID_SUBJECT || 'mailto:contacto@localhost'
  ).trim()
  const publicBytes = decodeKey(publicKey)
  const privateBytes = decodeKey(privateKey)
  const valid =
    publicBytes?.length === 65 &&
    publicBytes[0] === 0x04 &&
    privateBytes?.length === 32 &&
    pairMatches(publicBytes, privateBytes)

  return { publicKey, privateKey, subject, valid }
}

export const getVapidPublicKey = () => readVapidKeys().publicKey

export const isWebPushConfigured = () => readVapidKeys().valid

export const configureWebPush = () => {
  const keys = readVapidKeys()
  if (!keys.valid) return false
  if (configured) return true

  webPush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey)
  configured = true
  return true
}

export const sendPushNotification = (subscription, payload) => {
  if (!configureWebPush()) {
    const error = new Error('VAPID no configurado')
    error.statusCode = 503
    throw error
  }

  return webPush.sendNotification(
    subscription,
    JSON.stringify(payload ?? { title: 'JM Panel', body: 'Nueva notificación' })
  )
}
