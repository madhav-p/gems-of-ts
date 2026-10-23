import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError } from '../src'

import { model } from './model'

const Base = model.object({
  name: model.string({ length: { min: 1 } }),
  age: model.number({ min: 0 }),
  email: model.string().optional(),
})

describe('object static methods', () => {
  it('pick selects fields', () => {
    const Picked = Base.pick(['name', 'age'])
    const value = Picked.parse({ name: 'Ada', age: 36, email: 'ada@example.com' })

    expect(value).toEqual({ name: 'Ada', age: 36 })
    expect(value).toBeInstanceOf(Picked)
    expectTypeOf(value).toMatchTypeOf<{ name: string; age: number }>()
    expect(Picked.toJSONSchema()).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'number', minimum: 0 },
      },
      required: ['name', 'age'],
      additionalProperties: false,
    })
  })

  it('omit removes fields', () => {
    const Omitted = Base.omit(['age'])
    const value = Omitted.parse({ name: 'Ada', email: 'ada@example.com' })

    expect(value).toEqual({ name: 'Ada', email: 'ada@example.com' })
    expectTypeOf(value).toMatchTypeOf<{ name: string; email?: string }>()
    expect(Omitted.toJSONSchema().required).toEqual(['name'])
  })

  it('partial makes every field optional', () => {
    const Partial = Base.partial()

    expect(Partial.parse({})).toEqual({})
    expect(Partial.parse({ name: 'Ada' })).toEqual({ name: 'Ada' })
    expect(Partial.toJSONSchema().required).toEqual([])
    expectTypeOf(Partial.parse({})).toMatchTypeOf<{
      name?: string
      age?: number
      email?: string
    }>()
  })

  it('required makes every field required', () => {
    const Required = Base.required()

    expect(() => Required.parse({ name: 'Ada' })).toThrow(ModelParseError)
    expect(Required.toJSONSchema().required).toEqual(['name', 'age', 'email'])

    const value = Required.parse({
      name: 'Ada',
      age: 36,
      email: 'ada@example.com',
    })
    expectTypeOf(value.email).toEqualTypeOf<string>()
  })

  it('merge combines fields with the later schema winning', () => {
    const A = model.object({ a: model.string(), shared: model.string() })
    const B = model.object({ b: model.number(), shared: model.number() })
    const Merged = A.merge(B)

    const value = Merged.parse({ a: 'x', b: 1, shared: 2 })
    expect(value).toEqual({ a: 'x', b: 1, shared: 2 })
    expectTypeOf(value.shared).toEqualTypeOf<number>()
    expect(Merged.toJSONSchema().required.sort()).toEqual(['a', 'b', 'shared'])
  })

  it('inherits combinators on subclasses', () => {
    class Admin extends Base {}
    const Picked = Admin.pick(['name'])

    expect(Picked.parse({ name: 'Ada' })).toEqual({ name: 'Ada' })
  })

  it('rejects unknown pick/omit keys at runtime and in types', () => {
    expect(() => Base.pick(['nope'] as never)).toThrow(ModelDefinitionError)
    expect(() => Base.omit(['nope'] as never)).toThrow(ModelDefinitionError)

    const invalid = () => {
      // @ts-expect-error unknown field
      Base.pick(['nope'])
      // @ts-expect-error unknown field
      Base.omit(['nope'])
    }
    expect(invalid).toBeTypeOf('function')
  })
})
