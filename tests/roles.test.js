import { describe, expect, it } from 'vitest'
import RoleModel, {
  ROLE_NAMES,
  grantsFullAccess
} from '../src/modules/roles/roles.model.js'
import UserModel from '../src/modules/users/users.model.js'

describe('Roles', () => {
  it('guarda Manager, Supervisor, Staff y User, y el usuario apunta a ese id', () => {
    expect(RoleModel.schema.path('name').enumValues).toEqual(ROLE_NAMES)
    expect(UserModel.schema.path('role').instance).toBe('ObjectId')
    expect(UserModel.schema.path('role').options.ref).toBe('Role')
    expect(UserModel.schema.path('isAdmin')).toBeUndefined()
    expect(grantsFullAccess('Manager')).toBe(true)
    expect(grantsFullAccess('Supervisor')).toBe(true)
    expect(grantsFullAccess('Staff')).toBe(false)
    expect(grantsFullAccess('User')).toBe(false)
  })
})
