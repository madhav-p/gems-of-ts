import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { mutate, ModelDefinitionError, ModelParseError } from '../src'

import { model } from './model'

const Address = model.object({ street: model.string({ length: { min: 1 } }) })
const User = model.object({
  name: model.string({ length: { min: 1 } }),
  age: model.number({ min: 0 }).optional(),
  tags: model.list(model.string()),
  address: Address,
})

const raw = {
  name: 'Ada',
  age: 36,
  tags: ['admin'],
  address: { street: '1 Main St' },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mutate', () => {
  it('infers the schema from a parsed object instance', () => {
    const user = User.parse(raw)
    const next = mutate(user, (draft) => {
      draft.name = 'Grace'
    })

    expect(next).toBeInstanceOf(User)
    expect(next.name).toBe('Grace')
    expect(next.address).toBe(user.address)
    expectTypeOf(next).toEqualTypeOf<typeof user>()
  })

  it('infers the schema from a parsed list instance', () => {
    const Name = model.string({ length: { min: 1 } })
    const Tags = model.list(Name)
    const tags = Tags.parse(['a'])
    const elementSpy = vi.spyOn(Name, 'parse')

    const next = mutate(tags, (draft) => {
      draft.push('b')
    })

    expect(next).toEqual(['a', 'b'])
    expect(elementSpy).toHaveBeenCalledTimes(1)
    expectTypeOf(next).toEqualTypeOf<typeof tags>()
  })

  it('infers subclass schemas from instances', () => {
    class Admin extends User {}
    const admin = Admin.parse(raw)
    const next = mutate(admin, (draft) => {
      draft.name = 'Grace'
    })

    expect(next).toBeInstanceOf(Admin)
    expectTypeOf(next).toEqualTypeOf<typeof admin>()
  })

  it('rejects raw input at the type level', () => {
    const invalid = () => {
      // @ts-expect-error raw objects are not parsed model values
      mutate(raw, (draft) => {
        draft.name = 'Grace'
      })
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('rejects raw input at runtime', () => {
    expect(() => mutate(raw as never, () => {})).toThrow(ModelDefinitionError)
  })

  it('applies a recipe and returns a new validated instance', () => {
    const user = User.parse(raw)
    const next = mutate(user, (draft) => {
      draft.name = 'Grace'
      draft.age = 37
      draft.tags.push('staff')
      draft.address.street = '2 Main St'
    })

    expect(next).not.toBe(user)
    expect(next).toBeInstanceOf(User)
    expect(next.name).toBe('Grace')
    expect(next.age).toBe(37)
    expect(next.tags).toEqual(['admin', 'staff'])
    expect(next.address.street).toBe('2 Main St')
    expect(Object.isFrozen(next)).toBe(true)

    expect(user.name).toBe('Ada')
    expect(user.tags).toEqual(['admin'])
    expect(user.address.street).toBe('1 Main St')
  })

  it('retains unchanged fields by reference', () => {
    const user = User.parse(raw)
    const next = mutate(user, (draft) => {
      draft.name = 'Grace'
    })

    expect(next.name).toBe('Grace')
    expect(next.address).toBe(user.address)
    expect(next.tags).toBe(user.tags)

    const nested = mutate(user, (draft) => {
      draft.address.street = '2 Main St'
    })

    expect(nested.address).not.toBe(user.address)
    expect(nested.address.street).toBe('2 Main St')
    expect(nested.tags).toBe(user.tags)
    expect(nested.name).toBe(user.name)
  })

  it('shares unchanged nested subtrees', () => {
    const Geo = model.object({ lat: model.number(), lng: model.number() })
    const NestedAddress = model.object({ street: model.string(), geo: Geo })
    const Profile = model.object({ name: model.string(), address: NestedAddress })
    const profile = Profile.parse({
      name: 'Ada',
      address: { street: '1 Main St', geo: { lat: 1, lng: 2 } },
    })

    const next = mutate(profile, (draft) => {
      draft.address.street = '2 Main St'
    })

    expect(next.address).not.toBe(profile.address)
    expect(next.address.geo).toBe(profile.address.geo)
    expect(next.address.street).toBe('2 Main St')
  })

  it('only revalidates changed fields', () => {
    const Name = model.string({ length: { min: 1 } })
    const Address = model.object({ street: model.string({ length: { min: 1 } }) })
    const Profile = model.object({
      name: Name,
      tags: model.list(Name),
      address: Address,
    })
    const profile = Profile.parse({
      name: 'Ada',
      tags: ['admin'],
      address: { street: '1 Main St' },
    })

    const nameSpy = vi.spyOn(Name, 'parse')
    const addressSpy = vi.spyOn(Address, 'parse')
    const streetSpy = vi.spyOn(Address.fields.street, 'parse')

    const next = mutate(profile, (draft) => {
      draft.name = 'Grace'
    })

    expect(nameSpy).toHaveBeenCalledTimes(1)
    expect(addressSpy).not.toHaveBeenCalled()
    expect(streetSpy).not.toHaveBeenCalled()
    expect(next.address).toBe(profile.address)
    expect(next.tags).toBe(profile.tags)
  })

  it('only validates changed list elements', () => {
    const Element = model.string({ length: { min: 1 } })
    const Tags = model.list(Element)
    const tags = Tags.parse(['a'])

    const elementSpy = vi.spyOn(Element, 'parse')
    const next = mutate(tags, (draft) => {
      draft.push('b')
    })

    expect(elementSpy).toHaveBeenCalledTimes(1)
    expect(next[0]).toBe('a')
    expect(next[1]).toBe('b')
  })

  it('reuses unchanged object elements in lists', () => {
    const Item = model.object({ name: model.string({ length: { min: 1 } }) })
    const Items = model.list(Item)
    const items = Items.parse([{ name: 'a' }, { name: 'b' }])

    const itemSpy = vi.spyOn(Item, 'parse')
    const next = mutate(items, (draft) => {
      draft[1]!.name = 'B'
    })

    expect(itemSpy).not.toHaveBeenCalled()
    expect(next[0]).toBe(items[0])
    expect(next[1]).not.toBe(items[1])
    expect(next[1]!.name).toBe('B')
  })

  it('validates the final mutated value', () => {
    const user = User.parse(raw)

    expect(() =>
      mutate(user, (draft) => {
        draft.name = ''
      }),
    ).toThrow(ModelParseError)
    expect(() =>
      mutate(user, (draft) => {
        draft.address.street = ''
      }),
    ).toThrow(ModelParseError)
    expect(() =>
      mutate(user, (draft) => {
        draft.tags.push(42 as unknown as string)
      }),
    ).toThrow(ModelParseError)
    expect(() =>
      mutate(user, (draft) => {
        delete (draft as { name?: string }).name
      }),
    ).toThrow(ModelParseError)
  })

  it('cannot bypass validation by freezing the draft', () => {
    const user = User.parse(raw)

    expect(() =>
      mutate(user, (draft) => {
        draft.name = ''
        Object.freeze(draft)
        return draft
      }),
    ).toThrow(ModelParseError)
  })

  it('allows deleting an optional field', () => {
    const user = User.parse(raw)
    const next = mutate(user, (draft) => {
      delete draft.age
    })

    expect('age' in next).toBe(false)
  })

  it('returns the base when the recipe makes no changes', () => {
    const user = User.parse(raw)

    expect(mutate(user, () => {})).toBe(user)
    expect(
      mutate(user, (draft) => {
        draft.name = 'Ada'
      }),
    ).toBe(user)
  })

  it('returns an existing instance early', () => {
    const user = User.parse(raw)
    expect(mutate(user, () => {})).toBe(user)
  })

  it('supports returning a replacement', () => {
    const user = User.parse(raw)
    const next = mutate(user, () => ({
      name: 'Grace',
      tags: [],
      address: { street: '2 Main St' },
    }))

    expect(next.name).toBe('Grace')
    expect(next.tags).toEqual([])
    expect('age' in next).toBe(false)
  })

  it('keeps subclass methods on drafts', () => {
    class Person extends model.object({ name: model.string() }) {
      greet(): string {
        return `Hello ${this.name}`
      }
    }

    const person = Person.parse({ name: 'Ada' })
    const next = mutate(person, (draft) => {
      draft.name = 'Grace'
      expect(draft.greet()).toBe('Hello Grace')
    })

    expect(next.greet()).toBe('Hello Grace')
  })

  it('works on lists', () => {
    const tags = model.list(model.string()).parse(['a'])
    const next = mutate(tags, (draft) => {
      draft.push('b')
    })

    expect(next).toEqual(['a', 'b'])
    expect(next).not.toBe(tags)
    expect(Object.isFrozen(next)).toBe(true)
  })

  it('types the draft as mutable and the result as readonly', () => {
    const user = User.parse(raw)
    const next = mutate(user, (draft) => {
      draft.name = 'Grace'
      expectTypeOf(draft.name).toEqualTypeOf<string>()
      expectTypeOf(draft.tags).toEqualTypeOf<string[]>()
    })

    expectTypeOf(next).toEqualTypeOf<typeof user>()
    const invalid = () => {
      // @ts-expect-error result is readonly
      next.name = 'Kurt'
    }
    expect(invalid).toBeTypeOf('function')
  })
})
