# API de Inventario - Documentación de Cambios

## Cambios Realizados en Backend

### 1. Controlador Mejorado: `InventoryRecord.controllers.js`

#### Funciones Nuevas:

**`getDailySalesSummary(req, res)`**

- Resumen de ventas por día
- Query params: `date` (opcional, formato YYYY-MM-DD)
- Retorna:
  - `totalSales`: Monto total de ventas del día
  - `totalTransactions`: Número de transacciones
  - `productsSold`: Cantidad de productos vendidos
  - `transactions`: Array de transacciones

**`getLowStockProducts(req, res)`**

- Lista productos con stock <= stock mínimo
- Retorna array de productos con bajo stock

**`getSalesByDateRange(req, res)`**

- Movimientos en un rango de fechas
- Query params: `startDate`, `endDate` (formato YYYY-MM-DD)
- Retorna:
  - `totalRevenue`: Monto total de ventas
  - `totalRecords`: Total de movimientos
  - `byType`: Agrupado por tipo de movimiento
  - `allRecords`: Array con todos los movimientos

**`getInventoryByType(req, res)`**

- Movimientos de un tipo específico
- Query params: `type` (nombre del tipo)
- Retorna:
  - `count`: Total de movimientos
  - `records`: Array de movimientos

**`getInventoryStats(req, res)`**

- Estadísticas generales del inventario
- Retorna:
  - `totalProducts`: Total de productos
  - `totalInventoryValue`: Valor total en stock
  - `lowStockProducts`: Cantidad con stock bajo
  - `outOfStockProducts`: Cantidad sin stock
  - `totalSalesValue`: Valor total vendido
  - `totalMovements`: Total de movimientos

#### Funciones Mejoradas:

**`createInventoryRecord(req, res)`** - Ahora:

- Valida IDs de ObjectId
- Verifica tipo de inventario (entrada vs salida)
- Valida stock disponible para salidas
- Actualiza stock del producto automáticamente
- Actualiza DailyInformation si es salida
- Manejo de errores mejorado con async/await

### 2. Rutas Actualizadas: `InventoryRecord.routes.js`

Nuevas rutas de reportes:

```javascript
GET / reports / daily - summary // GET /api/inventory-records/reports/daily-summary
GET / reports / low - stock // GET /api/inventory-records/reports/low-stock
GET / reports / date - range // GET /api/inventory-records/reports/date-range
GET / reports / by - type // GET /api/inventory-records/reports/by-type
GET / reports / stats // GET /api/inventory-records/reports/stats
```

Rutas existentes se mantienen igual:

```javascript
GET  /                  // Todos los registros
GET  /:id              // Un registro específico
POST /                 // Crear nuevo registro
PUT  /:id              // Actualizar registro
DELETE /:id            // Eliminar registro
```

---

## Flujo de Operación

### Crear Entrada (Compra)

```
POST /api/inventory-records
Body: {
  date: "2024-08-20",
  typeInventory: "ObjectId_de_Compra",
  productName: "ObjectId_del_producto",
  category: "ObjectId_de_categoria",
  productPrice: 100,
  quantity: 10,
  totalAmount: 1000,
  Observations: "Compra a proveedor X"
}

Backend:
1. Valida que sea una "entrada"
2. Verifica que el producto existe
3. Crea el registro en InventoryRecord
4. Suma la cantidad al stock del producto: product.productStock += 10
5. Actualiza DailyInformation si aplica
6. Retorna el registro con datos poblados
```

### Crear Salida (Venta)

```
POST /api/inventory-records
Body: {
  date: "2024-08-20",
  typeInventory: "ObjectId_de_Venta",
  productName: "ObjectId_del_producto",
  category: "ObjectId_de_categoria",
  productPrice: 100,
  quantity: 5,
  totalAmount: 500,
  Observations: "Venta a cliente ABC"
}

Backend:
1. Valida que sea una "salida"
2. Verifica que el producto existe
3. VALIDA que product.productStock >= 5
4. Si hay stock:
   - Crea el registro en InventoryRecord
   - Resta la cantidad del stock: product.productStock -= 5
   - Actualiza DailyInformation (totalSales += 500)
   - Retorna el registro con éxito
5. Si NO hay stock:
   - Retorna error 400 con mensaje "Stock insuficiente"
   - No crea el registro
```

---

## Validaciones Agregadas

### Stock Validation

- Antes de permitir salida, verifica: `product.productStock >= quantity`
- Si falla, retorna error 400 con:
  - `message`: "Stock insuficiente"
  - `availableStock`: Stock disponible
  - `requestedQuantity`: Cantidad solicitada

### Type Validation

- Determina si es entrada o salida basado en `typeInventory.typeInventory`
- Detecta si contiene: "salida", "venta", "ajuste negativo"
- Para otros tipos, se considera entrada

### Product Validation

- Verifica que el producto exista
- Verifica que el tipo de inventario exista
- Valida ObjectIds válidos

---

## Respuestas de Error

### Error 400 - Stock Insuficiente

```json
{
  "message": "Stock insuficiente",
  "availableStock": 5,
  "requestedQuantity": 10
}
```

### Error 404 - Producto no encontrado

```json
{
  "message": "Producto no encontrado"
}
```

### Error 400 - IDs inválidos

```json
{
  "message": "IDs inválidos"
}
```

### Error 500 - Error del servidor

```json
{
  "message": "Ha ocurrido un error al crear el registro de inventario",
  "error": "Mensaje de error específico"
}
```

---

## Testing de Endpoints

### 1. Obtener resumen diario

```bash
curl http://localhost:3000/api/inventory-records/reports/daily-summary?date=2024-08-20
```

### 2. Obtener productos con stock bajo

```bash
curl http://localhost:3000/api/inventory-records/reports/low-stock
```

### 3. Obtener ventas por rango de fechas

```bash
curl http://localhost:3000/api/inventory-records/reports/date-range?startDate=2024-08-15&endDate=2024-08-20
```

### 4. Obtener movimientos por tipo

```bash
curl http://localhost:3000/api/inventory-records/reports/by-type?type=Venta
```

### 5. Obtener estadísticas

```bash
curl http://localhost:3000/api/inventory-records/reports/stats
```

---

## Notas Importantes

1. **Transacciones**: Los cambios de stock se hacen de forma atómica - si algo falla, se revierte todo
2. **Auditoría**: El campo `User` registra quién hizo cada movimiento (del token JWT)
3. **DailyInformation**: Se actualiza automáticamente solo para salidas (ventas)
4. **Stock Negativo**: El sistema no permite stock negativo en salidas

---

## Dependencias Requeridas

El código usa:

- `mongoose` para ODM y validaciones
- `async/await` para manejo de promesas
- `morgan` y `compression` (ya existentes)

No requiere nuevas dependencias npm.
