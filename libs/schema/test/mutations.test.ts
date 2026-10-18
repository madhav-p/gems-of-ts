import { describe, expect, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

const t = createSchemaBuilder()
const { array, number, object, string } = t

const nonEmptyString = () => string((sv) => sv.length((nv) => nv.min(1)))

class Address extends object({
  street: nonEmptyString(),
  city: nonEmptyString(),
}) {}

class User extends object({
  name: nonEmptyString(),
  age: number((nv) => nv.format('int')).optional(),
  address: Address,
}) {}

const valid = { name: 'Ada', age: 36, address: { street: '1 Main St', city: 'Springfield' } }

describe('object mutations', () => {
  it('validates plain assignment (set)', () => {
    const user = User.parse(valid)
    user.name = 'Grace'
    expect(user.name).toBe('Grace')
    expect(() => {
      user.name = ''
    }).toThrow(SchemaParseError)
    expect(() => {
      Reflect.set(user, 'name', '')
    }).toThrow(SchemaParseError)
  })

  it('validates Object.defineProperty', () => {
    const user = User.parse(valid)
    Object.defineProperty(user, 'name', { value: 'Grace', configurable: true })
    expect(user.name).toBe('Grace')
    expect(() => {
      Object.defineProperty(user, 'name', { value: '', configurable: true })
    }).toThrow(SchemaParseError)
  })

  it('ignores defineProperty for unknown keys', () => {
    const user = User.parse(valid) as User & { extra?: unknown }
    Object.defineProperty(user, 'extra', { value: 'nope', configurable: true })
    expect('extra' in user).toBe(false)
  })

  it('rejects deleting a required property', () => {
    const user = User.parse(valid)
    expect(() => {
      delete (user as { name?: string }).name
    }).toThrow(SchemaParseError)
  })

  it('allows deleting an optional property', () => {
    const user = User.parse(valid)
    delete user.age
    expect('age' in user).toBe(false)
  })

  it('allows deleting an unknown key', () => {
    const user = User.parse(valid)
    expect(delete (user as { extra?: unknown }).extra).toBe(true)
  })
})

describe('array mutations', () => {
  it('validates indexes and insertions', () => {
    const list = array(nonEmptyString()).parse(['a'])
    expect(() => {
      list.push('')
    }).toThrow(SchemaParseError)
    expect(() => {
      list[0] = ''
    }).toThrow(SchemaParseError)
    expect(() => {
      list.fill('')
    }).toThrow(SchemaParseError)
  })

  it('validates Object.defineProperty on an index', () => {
    const list = array(nonEmptyString()).parse(['a'])
    Object.defineProperty(list, '0', { value: 'b', configurable: true })
    expect(list[0]).toBe('b')
    expect(() => {
      Object.defineProperty(list, '0', { value: '', configurable: true })
    }).toThrow(SchemaParseError)
  })

  it('rejects deleting an element (leaves undefined)', () => {
    const list = array(nonEmptyString()).parse(['a'])
    expect(() => {
      delete (list as unknown as { [n: number]: string })[0]
    }).toThrow(SchemaParseError)
  })

  it('enforces maxItems on push/unshift/splice', () => {
    const bounded = array(nonEmptyString()).max(2).parse(['a', 'b'])
    expect(() => {
      bounded.push('c')
    }).toThrow(SchemaParseError)
    expect(() => {
      bounded.unshift('c')
    }).toThrow(SchemaParseError)
    expect(() => {
      bounded.splice(0, 0, 'c')
    }).toThrow(SchemaParseError)
  })

  it('enforces minItems on pop/shift/splice/length', () => {
    const bounded = array(nonEmptyString()).min(2).parse(['a', 'b'])

    const popped = array(nonEmptyString()).min(2).parse(['a', 'b'])
    expect(() => {
      popped.pop()
    }).toThrow(SchemaParseError)

    const shifted = array(nonEmptyString()).min(2).parse(['a', 'b'])
    expect(() => {
      shifted.shift()
    }).toThrow(SchemaParseError)

    expect(() => {
      bounded.splice(0, 1)
    }).toThrow(SchemaParseError)

    const truncated = array(nonEmptyString()).min(2).parse(['a', 'b'])
    expect(() => {
      truncated.length = 1
    }).toThrow(SchemaParseError)
  })

  it('rejects growing an array with holes', () => {
    const list = array(nonEmptyString()).parse(['a'])
    expect(() => {
      list.length = 3
    }).toThrow(SchemaParseError)
  })
})
