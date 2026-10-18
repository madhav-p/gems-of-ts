import { describe, expect, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

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

describe('object schemas (class output)', () => {
  it('parses through the static parse', () => {
    const john = User.parse({
      name: 'John',
      age: 25,
      address: { street: '1 Main St', city: 'Springfield' },
      tags: ['admin'],
    })
    expect(john.name).toBe('John')
    expect(john.age).toBe(25)
    expect(john.address.city).toBe('Springfield')
    expect(john.tags).toEqual(['admin'])
  })

  it('reports nested paths through safeParse', () => {
    const result = User.safeParse({
      name: '',
      address: { street: '', city: 'Springfield' },
      tags: [''],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.issues.map((issue) => issue.path.join('.'))
      expect(paths).toContain('name')
      expect(paths).toContain('address.street')
      expect(paths).toContain('tags.0')
    }
  })

  it('emits nested JSON Schema', () => {
    expect(User.toJSONSchema()).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'integer', minimum: 0 },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', minLength: 1 },
            city: { type: 'string', minLength: 1 },
          },
          required: ['street', 'city'],
          additionalProperties: false,
        },
        tags: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
      required: ['name', 'address', 'tags'],
      additionalProperties: false,
    })
  })

  it('parse returns the user class and instanceof holds', () => {
    const typed: User = User.parse({
      name: 'Ada',
      address: { street: '1 Main St', city: 'Springfield' },
      tags: [],
    })
    expect(typed instanceof User).toBe(true)
    expect(typed.address instanceof Address).toBe(true)
  })

  it('the constructor validates and returns the class instance', () => {
    const typed: User = new User({
      name: 'Ada',
      address: { street: '1 Main St', city: 'Springfield' },
      tags: [],
    })
    expect(typed.name).toBe('Ada')
    expect(typed instanceof User).toBe(true)

    // overriding the constructor cannot skip validation — `super()` runs parse
    class StrictUser extends object({ name: nonEmptyString() }) {
      constructor(value: unknown) {
        super(value)
      }
    }
    expect(() => new StrictUser({ name: '' })).toThrow(SchemaParseError)
  })
})

describe('object mutation validation (proxy)', () => {
  it('re-parses a property on assignment', () => {
    const user = User.parse({
      name: 'John',
      address: { street: '1 Main St', city: 'Springfield' },
      tags: [],
    })

    user.name = 'Jane'
    expect(user.name).toBe('Jane')

    expect(() => {
      user.name = ''
    }).toThrow(SchemaParseError)
    expect(() => {
      user.age = 1.5
    }).toThrow(SchemaParseError)
  })

  it('re-parses a nested user-defined object on assignment', () => {
    const address = Address.parse({ street: '1 Main St', city: 'Springfield' })
    address.city = 'Shelbyville'
    expect(address.city).toBe('Shelbyville')
    expect(() => {
      address.city = ''
    }).toThrow(SchemaParseError)
  })

  it('ignores unknown keys', () => {
    const user = User.parse({
      name: 'John',
      address: { street: '1 Main St', city: 'Springfield' },
      tags: [],
    }) as unknown as Record<string, unknown>
    user.extra = 'nope'
    expect('extra' in user).toBe(false)
  })
})

describe('array schemas', () => {
  class Tags extends array(nonEmptyString()) {}

  it('parse returns the array subclass and keeps array methods', () => {
    const tags: Tags = Tags.parse(['a', 'b'])
    expect(tags instanceof Tags).toBe(true)
    expect(Array.isArray(tags)).toBe(true)
    expect(tags.push('c')).toBe(3)
    expect(() => tags.push('')).toThrow(SchemaParseError)
  })

  it('validates index assignment and mutating methods', () => {
    const list = array(nonEmptyString()).parse(['a'])

    list[0] = 'b'
    expect(list[0]).toBe('b')
    expect(() => {
      list[0] = ''
    }).toThrow(SchemaParseError)

    expect(list.push('c')).toBe(2)
    expect(() => list.push('')).toThrow(SchemaParseError)

    expect(list.unshift('z')).toBe(3)
    list.splice(0, 1, 'q')
    expect(list[0]).toBe('q')
    expect(() => list.splice(0, 0, 5 as unknown as string)).toThrow(SchemaParseError)
  })
})
