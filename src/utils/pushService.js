import PushSubscription from '../models/pushNotifications.model.js'
import { sendPushNotification } from './webPush.js'

const staleStatus = new Set([401, 403, 404, 410])

export const sendPushToUser = async (userId, payload) => {
  if (!userId) return

  const subscriptions = await PushSubscription.find({
    user: String(userId)
  }).lean()
  if (subscriptions.length === 0) return

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendPushNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          payload
        )
      } catch (error) {
        if (staleStatus.has(error.statusCode)) {
          await PushSubscription.deleteOne({ _id: subscription._id })
        }
      }
    })
  )
}
