// Redondea a 2 decimales evitando errores de punto flotante (1.005 -> 1.01)
export const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100

// cantidad x precio; devuelve null si alguno no es numérico
export const lineTotal = (quantity, price) => {
  const qty = Number(quantity)
  const unit = Number(price)
  if (!Number.isFinite(qty) || !Number.isFinite(unit)) return null
  return roundMoney(qty * unit)
}
