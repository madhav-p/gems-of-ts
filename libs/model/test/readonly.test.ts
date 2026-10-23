import { describe, expect, expectTypeOf, it } from 'vitest'

import { model } from './model'

const Address = model.object({ street: model.string({ length: { min: 1 } }) })
const User = model.object({
  name: model.string({ length: { min: 1 } }),
  age: model.number({ min: 0 }).optional(),
  tags: model.list(model.string()),
  address: Address,
})
const Tags = model.list(model.string())

class Admin extends User {}

const raw = {
  name: 'Ada',
  age: 36,
  tags: ['admin'],
  address: { street: '1 Main St' },
}

describe('readonly parse output', () => {
  it('is deeply readonly at the type level', () => {
    const user = User.parse(raw)
    const invalid = () => {
      // @ts-expect-error readonly property
      user.name = 'Grace'
      // @ts-expect-error readonly nested property
      user.address.street = '2 Main St'
      // @ts-expect-error readonly array
      user.tags.push('staff')
    }

    expect(invalid).toBeTypeOf('function')
    expectTypeOf(user.tags).toEqualTypeOf<readonly string[]>()
  })

  it('is frozen at runtime', () => {
    const user = User.parse(raw)

    expect(Object.isFrozen(user)).toBe(true)
    expect(Object.isFrozen(user.tags)).toBe(true)
    expect(Object.isFrozen(user.address)).toBe(true)

    expect(() => {
      // @ts-expect-error readonly at runtime
      user.name = 'Grace'
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error readonly at runtime
      user.tags.push('staff')
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error readonly at runtime
      user.address.street = '2 Main St'
    }).toThrow(TypeError)
  })

  it('safeParse data is readonly too', () => {
    const result = User.safeParse(raw)

    expect(result.success).toBe(true)
    if (result.success) {
      const invalid = () => {
        // @ts-expect-error readonly safeParse data
        result.data.name = 'Grace'
      }
      expect(invalid).toBeTypeOf('function')
    }
  })

  it('freezes list output', () => {
    const tags = Tags.parse(['a'])

    expect(Object.isFrozen(tags)).toBe(true)
    const invalid = () => {
      // @ts-expect-error readonly array
      tags.push('b')
    }
    expect(invalid).toBeTypeOf('function')
    expect(() => {
      // @ts-expect-error readonly at runtime
      tags.push('b')
    }).toThrow(TypeError)
  })

  it('returns an existing instance early', () => {
    const user = User.parse(raw)
    const admin = Admin.parse(raw)

    expect(User.parse(user)).toBe(user)
    expect(User.parse(admin)).toBe(admin)
    expect(Admin.parse(admin)).toBe(admin)

    const tags = Tags.parse(['a'])
    expect(Tags.parse(tags)).toBe(tags)
  })
})
