# Cambios Backend - Sistema SOLPED (Órdenes)

## Nuevos Archivos

### 1. **Controllers: Orders.controllers.js**

Controla la lógica de negocio para órdenes de compra.

#### Funciones:

**`getOrders()`**

- Obtiene todas las órdenes
- Retorna: Array de órdenes con proveedor poblado
- Ordenado por fecha descendente (más recientes primero)

**`getOrder(id)`**

- Obtiene una orden específica
- Parámetro: ID de la orden
- Retorna: Orden completa con proveedor

**`createOrder()`**

- Crea nueva orden de compra
- Campos requeridos:
  - `date`: Fecha (string)
  - `supplier`: ID del proveedor (ObjectId)
  - `items`: Array de productos
  - `totalAmount`: Monto total
  - `status`: Estado (opcional, default: "pendiente")

**`updateOrder(id)`**

- Actualiza orden existente
- Permite cambiar estado, items, total
- Retorna orden actualizada

**`deleteOrder(id)`**

- Elimina una orden
- Retorna mensaje de éxito

### 2. **Routes: Orders.routes.js**

Define los endpoints disponibles.

```javascript
GET    /api/orders         // Obtener todas las órdenes
GET    /api/orders/:id     // Obtener una orden
POST   /api/orders         // Crear nueva orden
PUT    /api/orders/:id     // Actualizar orden
DELETE /api/orders/:id     // Eliminar orden
```

Todas las rutas requieren autenticación (middleware `verifyToken`).

---

## Cambios al Modelo

### Orders.models.js - Actualizado

**Cambios principales:**

- ✅ Campo `items` mejorado (antes era `order`)
- ✅ Campos adicionales: `totalAmount`, `createdAt`
- ✅ `status` ahora es string con enum (antes era boolean)
- ✅ Mejor estructura para datos de productos

**Estructura Nueva:**

```javascript
{
  date: String,                    // Fecha YYYY-MM-DD
  supplier: ObjectId (ref Supplier),
  items: [
    {
      productId: ObjectId,         // Referencia al producto
      productName: String,         // Nombre del producto
      quantity: Number,            // Cantidad
      price: Number,               // Precio unitario
      subtotal: Number            // quantity × price
    }
  ],
  totalAmount: Number,             // Sum de subtotals
  status: String,                  // "pendiente"|"confirmado"|"completado"|"cancelado"
  createdAt: Date                  // Timestamp automático
}
```

---

## Cambios al Servidor

### server.js - Actualizado

**Agregado:**

```javascript
import OrdersRouter from './routes/Orders.routes.js'

// ...

app.use('/api/orders', OrdersRouter)
```

---

## Validaciones Backend

### En createOrder:

- ✅ Requiere `supplier`
- ✅ Requiere `items` (array no vacío)
- ✅ Valida estructura de items

### En getOrder, updateOrder, deleteOrder:

- ✅ Valida que ID sea ObjectId válido
- ✅ Retorna 404 si orden no existe
- ✅ Manejo de errores completo

---

## Respuestas de API

### Crear Orden - Success (201)

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "date": "2024-08-20",
  "supplier": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Proveedora ABC",
    "contactInfo": "contacto@abc.com"
  },
  "items": [
    {
      "productId": "507f1f77bcf86cd799439013",
      "productName": "Cuadernos",
      "quantity": 100,
      "price": 5.5,
      "subtotal": 550
    }
  ],
  "totalAmount": 550,
  "status": "pendiente",
  "createdAt": "2024-08-20T15:30:00.000Z"
}
```

### Error - Validación (400)

```json
{
  "message": "Proporciona proveedor e items"
}
```

### Error - No Encontrado (404)

```json
{
  "message": "Orden no encontrada"
}
```

### Error - Servidor (500)

```json
{
  "message": "Error al crear la orden",
  "error": "Detalles del error"
}
```

---

## Flujo de Datos

```
CREAR ORDEN
┌─────────────────────────────────────────────────┐
│ Frontend envía:                                  │
│ - Fecha                                          │
│ - Proveedor ID                                   │
│ - Array de items [{producto, qty, price}]      │
│ - Total Amount                                   │
│              ↓                                   │
│ POST /api/orders (con token)                    │
│              ↓                                   │
│ Backend:                                         │
│ 1. Valida que proveedor exista                  │
│ 2. Valida que items no esté vacío               │
│ 3. Crea documento Order en DB                   │
│ 4. Popula supplier                              │
│ 5. Retorna orden creada (201)                   │
│              ↓                                   │
│ Frontend:                                        │
│ - Muestra toast de éxito                        │
│ - Actualiza tabla                               │
│ - Cierra modal                                  │
└─────────────────────────────────────────────────┘

VER SOLPED
┌─────────────────────────────────────────────────┐
│ GET /api/orders/:id                             │
│              ↓                                   │
│ Backend retorna orden completa                  │
│              ↓                                   │
│ Frontend:                                        │
│ - Formatea SOLPED                               │
│ - Abre en modal para impresión                  │
│ - Usuario puede imprimir o cerrar               │
└─────────────────────────────────────────────────┘
```

---

## Testing

### Crear orden de prueba

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-08-20",
    "supplier": "507f1f77bcf86cd799439012",
    "items": [
      {
        "productId": "507f1f77bcf86cd799439013",
        "productName": "Cuadernos",
        "quantity": 100,
        "price": 5.50,
        "subtotal": 550
      }
    ],
    "totalAmount": 550,
    "status": "pendiente"
  }'
```

### Obtener todas las órdenes

```bash
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer TOKEN"
```

### Obtener orden específica

```bash
curl http://localhost:3000/api/orders/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer TOKEN"
```

---

## Notas Importantes

1. **Autenticación**: Todas las rutas requieren token JWT válido
2. **Validaciones**: El backend previene órdenes incompletas
3. **Población**: Las órdenes siempre incluyen datos del proveedor
4. **Estados**: Usa enum para garantizar valores válidos
5. **Timestamps**: `createdAt` se genera automáticamente

---

## Dependencias Usadas

- `mongoose`: ODM para MongoDB (ya existente)
- `express`: Framework web (ya existente)

No se agregaron nuevas dependencias npm.
