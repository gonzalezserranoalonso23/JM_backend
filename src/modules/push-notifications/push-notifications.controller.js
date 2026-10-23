/**
 * Suscripciones Web Push. Base: /api/push (requiere token)
 *
 * GET    /vapid-public-key -> getVapidKey     clave pública para subscribe()
 * POST   /subscribe        -> subscribePush   body: { endpoint, keys: { p256dh, auth }, expirationTime }
 * DELETE /subscribe        -> unsubscribePush body opcional: { endpoint }
 */
import PushSubscription from './push-notifications.model.js'
import { getVapidPublicKey, isWebPushConfigured } from '../../utils/webPush.js'

export const getVapidKey = (req, res) => {
  if (!isWebPushConfigured()) {
    return res
      .status(503)
      .json({ message: 'Notificaciones push no configuradas' })
  }

  return res.status(200).json({ publicKey: getVapidPublicKey() })
}

export const subscribePush = async (req, res) => {
  const { endpoint, keys, expirationTime } = req.body || {}

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({
      message: 'Se requiere endpoint y keys (p256dh, auth)'
    })
  }

  try {
    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.userId,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        expirationTime: expirationTime || null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    return res.status(201).json({
      id: subscription._id,
      endpoint: subscription.endpoint
    })
  } catch (error) {
    return res.status(500).json({
      message: 'No se pudo guardar la suscripción',
      error: error.message
    })
  }
}

export const unsubscribePush = async (req, res) => {
  const { endpoint } = req.body || {}
  const filter = { user: req.userId }
  if (endpoint) filter.endpoint = endpoint

  try {
    await PushSubscription.deleteMany(filter)
    return res.status(200).json({ message: 'Suscripción eliminada' })
  } catch (error) {
    return res.status(500).json({
      message: 'No se pudo eliminar la suscripción',
      error: error.message
    })
  }
}
