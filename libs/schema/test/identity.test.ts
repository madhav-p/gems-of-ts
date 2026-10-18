import { describe, expect, it } from 'vitest'
import { createSchemaBuilder } from '../src'

const t = createSchemaBuilder()
const { array, number, object, string } = t

const nonEmptyString = () => string((sv) => sv.length((nv) => nv.min(1)))
const nonNegativeInt = () => number((nv) => nv.format('int').min(0))

class Address extends object({
  street: nonEmptyString(),
  city: nonEmptyString(),
}) {}

class User extends object({
  name: nonEmptyString(),
  age: nonNegativeInt().optional(),
  address: Address,
  tags: array(nonEmptyString()),
}) {}

class Item extends object({ name: nonEmptyString() }) {}
class Container extends object({ items: array(Item) }) {}

const raw = () => ({
  name: 'Ada',
  age: 36,
  address: { street: '1 Main St', city: 'Springfield' },
  tags: ['admin', 'user'],
})

describe('re-parsing an already-parsed value is a no-op', () => {
  it('returns the same instance', () => {
    const user = User.parse(raw())
    expect(User.parse(user)).toBe(user)
  })

  it('reuses nested instances instead of rebuilding them', () => {
    const user = User.parse(raw())
    const address = user.address
    const tags = user.tags

    const reparsed = User.parse(user)
    expect(reparsed).toBe(user)
    expect(reparsed.address).toBe(address)
    expect(reparsed.tags).toBe(tags)
  })

  it('the constructor is a no-op for an existing instance', () => {
    const user = User.parse(raw())
    expect(new User(user)).toBe(user)
  })

  it('returns the same array instance', () => {
    const tagsSchema = array(nonEmptyString())
    const tags = tagsSchema.parse(['a', 'b'])
    expect(tagsSchema.parse(tags)).toBe(tags)
  })

  it('does not memoise raw input (a plain object is parsed fresh each time)', () => {
    expect(User.parse(raw())).not.toBe(User.parse(raw()))
  })
})

describe('mutations reuse already-parsed values', () => {
  it('reassigning a nested instance is free', () => {
    const user = User.parse(raw())
    const address = user.address
    user.address = address
    expect(user.address).toBe(address)
  })

  it('assigning a filtered array of already-parsed items skips nested parsing', () => {
    const container = Container.parse({ items: [{ name: 'a' }, { name: 'b' }] })
    const original = container.items
    const active = original.filter((item) => item.name !== 'b')

    container.items = active

    // `filter` produced a fresh (plain) array, so it gets re-wrapped ...
    expect(container.items).not.toBe(original)
    expect(container.items).toHaveLength(1)
    // ... but the item instances are reused, not re-parsed
    expect(container.items[0]).toBe(original[0])
  })

  it('still validates genuinely new values', () => {
    const container = Container.parse({ items: [{ name: 'a' }] })
    expect(() => {
      container.items.push({ name: '' })
    }).toThrow()
    expect(() => {
      container.items = [{ name: '' }]
    }).toThrow()
  })
})
