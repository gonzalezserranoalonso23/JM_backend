import usersRouter from './users.routes.js'
import rolesRouter from './roles.routes.js'
import appStateRouter from './appState.routes.js'
import categoriesRouter from './categories.routes.js'
import suppliersRouter from './suppliers.routes.js'
import productsRouter from './products.routes.js'
import typeInventoryRouter from './typeInventory.routes.js'
import paymentTypesRouter from './paymentTypes.routes.js'
import inventoryRecordsRouter from './inventoryRecords.routes.js'
import dailyInformationRouter from './dailyInformation.routes.js'
import tasksRouter from './tasks.routes.js'
import attendanceRouter from './attendance.routes.js'
import denominationsRouter from './denominations.routes.js'
import pushNotificationsRouter from './pushNotifications.routes.js'

/**
 * Public URL map. This is the only file that mounts routers.
 *
 * A new resource is four steps:
 * 1. models/<resource>.model.js stores the document.
 * 2. controllers/<resource>.controller.js handles the request.
 * 3. routes/<resource>.routes.js binds the path to the controller and to middleware.
 * 4. Import that router here and add one app.use line in the matching group.
 *
 * File names stay camelCase, matching the frontend service of the same resource.
 * The string passed to app.use is the URL the frontend already calls, so do not
 * rename it when the file name changes.
 * Shared helpers belong in utils/. Token checks and the error shape belong in middleware/.
 * One-time database work belongs in config/connection.js.
 */
export const registerRoutes = (app) => {
  // Who can sign in, which role they have, and whether the application is on.
  app.use('/api/users', usersRouter)
  app.use('/api/roles', rolesRouter)
  app.use('/api/app', appStateRouter)

  // Records the store keeps and edits from the catalogs.
  app.use('/api/categories', categoriesRouter)
  app.use('/api/suppliers', suppliersRouter)
  app.use('/api/products', productsRouter)
  app.use('/api/type-inventory', typeInventoryRouter)
  app.use('/api/payment-types', paymentTypesRouter)

  // Day-to-day work: stock, sales, shifts, and alerts.
  app.use('/api/inventory-records', inventoryRecordsRouter)
  app.use('/api/daily-information', dailyInformationRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/attendance', attendanceRouter)
  app.use('/api/denominations', denominationsRouter)
  app.use('/api/push', pushNotificationsRouter)
}
