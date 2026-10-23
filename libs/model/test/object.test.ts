import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelParseError } from '../src'

import { model } from './model'

const Address = model.object({
  street: model.string({ length: { min: 1 } }),
})

const User = model.object({
  name: model.string({ length: { min: 1 } }),
  age: model.number({ min: 0 }).optional(),
  tags: model.list(model.string()),
  address: Address,
})

const valid = {
  name: 'Ada',
  tags: ['admin'],
  address: { street: '1 Main St' },
}

describe('object', () => {
  it('parses into a plain object and strips unknown keys', () => {
    const user = User.parse({ ...valid, age: 36, extra: true })

    expect(user).toEqual({
      name: 'Ada',
      age: 36,
      tags: ['admin'],
      address: { street: '1 Main St' },
    })
    expect('extra' in user).toBe(false)
  })

  it('infers the parsed shape and optional keys', () => {
    const user = User.parse(valid)

    expectTypeOf(user.name).toEqualTypeOf<string>()
    expectTypeOf(user.age).toEqualTypeOf<number | undefined>()
    expectTypeOf(user.tags).toEqualTypeOf<readonly string[]>()
    expectTypeOf(user.address.street).toEqualTypeOf<string>()
    expectTypeOf(user).toMatchTypeOf<{
      readonly name: string
      readonly age?: number
      readonly tags: readonly string[]
      readonly address: { readonly street: string }
    }>()
  })

  it('omits absent optional fields', () => {
    const user = User.parse(valid)

    expect('age' in user).toBe(false)
  })

  it('reports nested paths', () => {
    const result = User.safeParse({
      name: '',
      tags: ['ok', 1],
      address: { street: '' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path.join('.'))).toEqual([
        'name',
        'tags.1',
        'address.street',
      ])
    }
  })

  it('rejects non-objects and missing required fields', () => {
    expect(() => User.parse(null)).toThrow(ModelParseError)
    expect(() => User.parse([])).toThrow(ModelParseError)
    expect(() => User.parse('x')).toThrow(ModelParseError)
    expect(() =>
      User.parse({ tags: [], address: { street: '1 Main St' } }),
    ).toThrow(ModelParseError)
  })

  it('emits JSON Schema with optional fields omitted from required', () => {
    expect(User.toJSONSchema()).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'number', minimum: 0 },
        tags: { type: 'array', items: { type: 'string' } },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', minLength: 1 },
          },
          required: ['street'],
          additionalProperties: false,
        },
      },
      required: ['name', 'tags', 'address'],
      additionalProperties: false,
    })
  })

  it('is optional-able', () => {
    expect(Address.optional().parse(undefined)).toBeUndefined()
    expect(Address.optional().parse({ street: '1 Main St' })).toEqual({
      street: '1 Main St',
    })
  })

  it('accepts a reserved options argument', () => {
    const schema = model.object({ name: model.string() }, {})

    expect(schema.parse({ name: 'Ada' })).toEqual({ name: 'Ada' })
    expect(schema.options).toEqual({})
  })

  it('is available on the model namespace', () => {
    const Point = model.object({ x: model.number(), y: model.number() })
    expect(Point.parse({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 })
  })
})
