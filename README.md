# JM_backend

## Inventory reference data

Inventory movements use MongoDB references rather than hard-coded type or
payment strings:

- `typeInventory` references a document from `GET /api/type-inventory`.
  Each type requires `typeInventory` and `stockDirection`; use `1` for a stock
  increase and `-1` for a stock decrease.
- `paymentType` references a document from `GET /api/payment-types` and may be
  `null` when a payment method does not apply.

Create the reference documents before posting to `/api/inventory-records`, then
send their IDs:

```json
{
  "typeInventory": "type-inventory-object-id",
  "paymentType": "payment-type-object-id"
}
```
