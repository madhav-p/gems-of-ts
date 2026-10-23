import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError, mutate } from '../src'

import { model } from './model'

const Circle = model.object({ radius: model.number() })
const Square = model.object({ side: model.number() })
const Shape = model.union({ circle: Circle, square: Square })
const Person = model.intersection([
  model.object({ name: model.string() }),
  model.object({ age: model.number() }),
])

describe('nullable', () => {
  it('accepts null and the base value', () => {
    const value = model.number({ min: 0 }).nullable()

    expect(value.parse(null)).toBeNull()
    expect(value.parse(1)).toBe(1)
    expect(() => value.parse(-1)).toThrow(ModelParseError)
    expect(value.toJSONSchema()).toEqual({
      anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }],
    })
    expectTypeOf(value.parse(null)).toEqualTypeOf<number | null>()
  })

  it('is idempotent and composes with optional', () => {
    const value = model.string().nullable()

    expect(value.nullable().parse(null)).toBeNull()
    expect(value.optional().parse(undefined)).toBeUndefined()
    expect(value.optional().parse(null)).toBeNull()
  })

  it('works on every composite type', () => {
    expect(model.object({ name: model.string() }).nullable().parse(null)).toBeNull()
    expect(model.list(model.string()).nullable().parse(null)).toBeNull()
    expect(model.record(model.number()).nullable().parse(null)).toBeNull()
    expect(model.tuple([model.number()]).nullable().parse(null)).toBeNull()
    expect(Shape.nullable().parse(null)).toBeNull()
    expect(Person.nullable().parse(null)).toBeNull()
  })
})

describe('default', () => {
  it('fills undefined with a validated default', () => {
    const role = model.string({ length: { min: 1 } }).default('user')

    expect(role.hasDefault).toBe(true)
    expect(role.parse(undefined)).toBe('user')
    expect(role.parse('admin')).toBe('admin')
    expect(role.toJSONSchema()).toEqual({
      type: 'string',
      minLength: 1,
      default: 'user',
    })
    expectTypeOf(role.parse(undefined)).toEqualTypeOf<string>()
  })

  it('throws when the default does not match the schema', () => {
    expect(() => model.string({ length: { min: 1 } }).default('')).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.number({ min: 0 }).default(-1)).toThrow(ModelDefinitionError)
    expect(() => model.literal('admin').default('user' as never)).toThrow(
      ModelDefinitionError,
    )
  })

  it('types the default argument', () => {
    const invalid = () => {
      // @ts-expect-error string default must be a string
      model.string().default(1)
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('fills defaulted object fields and omits them from required', () => {
    const User = model.object({
      name: model.string(),
      role: model.string().default('user'),
    })

    expect(User.parse({ name: 'Ada' })).toEqual({ name: 'Ada', role: 'user' })
    expect(User.toJSONSchema().required).toEqual(['name'])
    expect(User.toJSONSchema().properties.role).toEqual({
      type: 'string',
      default: 'user',
    })
  })

  it('restores a defaulted field when mutation deletes it', () => {
    const User = model.object({
      name: model.string(),
      role: model.string().default('user'),
    })
    const user = User.parse({ name: 'Ada', role: 'admin' })
    const next = mutate(user, (draft) => {
      delete (draft as { role?: string }).role
    })

    expect(next.role).toBe('user')
  })

  it('optional overrides the default for undefined', () => {
    const role = model.string().default('user').optional()

    expect(role.parse(undefined)).toBeUndefined()
    expect(role.parse('admin')).toBe('admin')
  })

  it('re-defaults', () => {
    const role = model.string().default('user').default('admin')
    expect(role.parse(undefined)).toBe('admin')
  })

  it('works with nullable', () => {
    const value = model.string().nullable().default(null)

    expect(value.parse(undefined)).toBeNull()
    expect(value.parse('x')).toBe('x')
  })

  it('keeps default semantics through nullable', () => {
    const User = model.object({
      role: model.string().default('user').nullable(),
    })

    expect(User.parse({})).toEqual({ role: 'user' })
    expect(User.parse({ role: null })).toEqual({ role: null })
    expect(User.toJSONSchema().required).toEqual([])
  })

  it('works on object and union schemas', () => {
    const Address = model.object({ street: model.string() })
    const fallback = Address.parse({ street: '1 Main St' })
    expect(Address.default(fallback).parse(undefined)).toBe(fallback)

    const circle = Shape.parse({ __type: 'circle', data: { radius: 1 } })
    expect(Shape.default(circle).parse(undefined)).toBe(circle)
  })
})
