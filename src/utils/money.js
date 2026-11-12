// Round to 2 decimals. 1.005 -> 1.01.
export const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100

// quantity x price. null when either value is not a number.
export const lineTotal = (quantity, price) => {
  const qty = Number(quantity)
  const unit = Number(price)
  if (!Number.isFinite(qty) || !Number.isFinite(unit)) return null
  return roundMoney(qty * unit)
}
