import webPush from 'web-push'

let configured = false

export const getVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || ''

export const isWebPushConfigured = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

export const configureWebPush = () => {
  if (configured) return isWebPushConfigured()
  if (!isWebPushConfigured()) return false

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contacto@localhost',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
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
