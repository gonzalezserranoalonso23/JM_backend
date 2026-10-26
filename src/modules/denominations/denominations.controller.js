/**
 * Caja fuerte. Base: /api/denominations (token + CASH_VAULT_SECRET)
 *
 * GET  /     -> getVaultUpdatedAt  solo la última fecha, sin cantidades
 * POST /open -> openVault          body: { secret }
 * PUT  /     -> saveVault          body: { secret, quantities: [{ value, quantity }] }
 */
import { timingSafeEqual } from 'crypto'
import Denomination from './denominations.model.js'
import { roundMoney } from '../../utils/money.js'

export const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5]

const MAX_QUANTITY = 1000000

const secretMatches = (provided) => {
  const expected = process.env.CASH_VAULT_SECRET || ''
  if (!expected || typeof provided !== 'string' || !provided) return false
  const attempt = Buffer.from(provided)
  const secret = Buffer.from(expected)
  if (attempt.length !== secret.length) return false
  return timingSafeEqual(attempt, secret)
}

const rejectSecret = (res, provided) => {
  if (!process.env.CASH_VAULT_SECRET) {
    res.status(503).json({ message: 'La caja fuerte no está configurada' })
    return true
  }
  if (!secretMatches(provided)) {
    res.status(403).json({ message: 'Clave incorrecta' })
    return true
  }
  return false
}

const ensureDenominations = () =>
  Denomination.bulkWrite(
    DENOMINATIONS.map((value) => ({
      updateOne: {
        filter: { value },
        update: { $setOnInsert: { value, quantity: 0, updatedAt: null } },
        upsert: true
      }
    }))
  )

const snapshot = async () => {
  const rows = await Denomination.find({ value: { $in: DENOMINATIONS } }).lean()
  const byValue = new Map(rows.map((row) => [row.value, row]))
  const denominations = DENOMINATIONS.map((value) => {
    const row = byValue.get(value)
    const quantity = row?.quantity ?? 0
    return {
      _id: row?._id,
      value,
      quantity,
      amount: roundMoney(value * quantity),
      updatedAt: row?.updatedAt ?? null
    }
  })
  const updatedAt = denominations.reduce((latest, row) => {
    if (!row.updatedAt) return latest
    if (!latest || new Date(row.updatedAt) > new Date(latest))
      return row.updatedAt
    return latest
  }, null)

  return {
    denominations,
    total: roundMoney(denominations.reduce((sum, row) => sum + row.amount, 0)),
    updatedAt
  }
}

const parseQuantities = (quantities) => {
  if (!Array.isArray(quantities)) return null
  const seen = new Set()
  const parsed = []

  for (const item of quantities) {
    const value = DENOMINATIONS.find(
      (denomination) => denomination === Number(item?.value)
    )
    const quantity = Number(item?.quantity)
    if (value === undefined || seen.has(value)) return null
    if (
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > MAX_QUANTITY
    ) {
      return null
    }
    seen.add(value)
    parsed.push({ value, quantity })
  }

  return parsed.length === DENOMINATIONS.length ? parsed : null
}

export const getVaultUpdatedAt = async (req, res) => {
  try {
    const latest = await Denomination.findOne({ updatedAt: { $ne: null } })
      .sort({ updatedAt: -1 })
      .select('updatedAt')
      .lean()

    res.status(200).json({ updatedAt: latest?.updatedAt ?? null })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const openVault = async (req, res) => {
  try {
    if (rejectSecret(res, req.body?.secret)) return
    await ensureDenominations()
    res.status(200).json(await snapshot())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const saveVault = async (req, res) => {
  try {
    if (rejectSecret(res, req.body?.secret)) return

    const quantities = parseQuantities(req.body?.quantities)
    if (!quantities) {
      return res.status(400).json({
        message: 'Indica una cantidad entera para cada denominación'
      })
    }

    await ensureDenominations()
    const current = await snapshot()
    const now = new Date()

    await Denomination.bulkWrite(
      quantities.map(({ value, quantity }) => {
        const previous = current.denominations.find(
          (row) => row.value === value
        )
        const changed = previous?.quantity !== quantity
        return {
          updateOne: {
            filter: { value },
            update: {
              $set: changed ? { quantity, updatedAt: now } : { quantity }
            }
          }
        }
      })
    )

    res.status(200).json(await snapshot())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
