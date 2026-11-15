import { describe, expect, it } from 'vitest'
import RoleModel, {
  ROLE_NAMES,
  grantsFullAccess,
  roleRank
} from '../src/models/roles.model.js'
import UserModel from '../src/models/users.model.js'

describe('Roles', () => {
  it('guarda Sudo, Manager, Supervisor, Staff y User, y el usuario apunta a ese id', () => {
    expect(RoleModel.schema.path('name').options.enum).toBeUndefined()
    expect(ROLE_NAMES).toEqual([
      'Sudo',
      'Manager',
      'Supervisor',
      'Staff',
      'User'
    ])
    expect(UserModel.schema.path('role').instance).toBe('ObjectId')
    expect(UserModel.schema.path('role').options.ref).toBe('Role')
    expect(UserModel.schema.path('isAdmin')).toBeUndefined()
    expect(grantsFullAccess('Sudo')).toBe(true)
    expect(grantsFullAccess('Manager')).toBe(true)
    expect(grantsFullAccess('Supervisor')).toBe(true)
    expect(grantsFullAccess('Staff')).toBe(false)
    expect(grantsFullAccess('User')).toBe(false)
    expect(roleRank('User')).toBeLessThan(roleRank('Staff'))
    expect(roleRank('Staff')).toBeLessThan(roleRank('Supervisor'))
    expect(roleRank('Supervisor')).toBeLessThan(roleRank('Manager'))
    expect(roleRank('Manager')).toBeLessThan(roleRank('Sudo'))
    expect(roleRank('Otro')).toBeGreaterThan(roleRank('Sudo'))
  })
})
