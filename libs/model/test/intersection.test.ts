import { describe, expect, expectTypeOf, it } from 'vitest'
import { mutate, ModelDefinitionError, ModelParseError } from '../src'

import { model } from './model'

const Named = model.object({ name: model.string({ length: { min: 1 } }) })
const Aged = model.object({ age: model.number({ min: 0 }) })
const Person = model.intersection([Named, Aged])

describe('intersection', () => {
  it('requires every schema and merges object output', () => {
    const person = Person.parse({ name: 'Ada', age: 36 })

    expect(person).toEqual({ name: 'Ada', age: 36 })
    expect(Object.getPrototypeOf(person)).toBe(Object.prototype)
    expectTypeOf(person).toMatchTypeOf<{
      readonly name: string
      readonly age: number
    }>()

    expect(() => Person.parse({ name: 'Ada', age: -1 })).toThrow(ModelParseError)
    expect(() => Person.parse({ name: '', age: 36 })).toThrow(ModelParseError)
  })

  it('emits JSON Schema allOf', () => {
    expect(Person.toJSONSchema()).toEqual({
      allOf: [
        {
          type: 'object',
          properties: { name: { type: 'string', minLength: 1 } },
          required: ['name'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { age: { type: 'number', minimum: 0 } },
          required: ['age'],
          additionalProperties: false,
        },
      ],
    })
  })

  it('supports primitive intersections', () => {
    const limited = model.intersection([
      model.string({ length: { min: 1 } }),
      model.string({ length: { max: 3 } }),
    ])

    expect(limited.parse('ab')).toBe('ab')
    expect(() => limited.parse('')).toThrow(ModelParseError)
    expect(() => limited.parse('abcd')).toThrow(ModelParseError)
    expectTypeOf(limited.parse('ab')).toEqualTypeOf<string>()
  })

  it('is optional and nullable', () => {
    expect(Person.optional().parse(undefined)).toBeUndefined()
    expect(Person.nullable().parse(null)).toBeNull()
  })

  it('does not accept intersection results in mutate', () => {
    const person = Person.parse({ name: 'Ada', age: 36 })
    const invalid = () => {
      // @ts-expect-error intersection output is not a branded model value
      mutate(person, () => {})
    }

    expect(invalid).toBeTypeOf('function')
    expect(() => mutate(person as never, () => {})).toThrow(ModelDefinitionError)
  })

  it('rejects an empty intersection at definition', () => {
    expect(() => model.intersection([] as never)).toThrow(ModelDefinitionError)
  })

  it('is available on the model namespace', () => {
    const Both = model.intersection([
      model.object({ a: model.number() }),
      model.object({ b: model.number() }),
    ])
    expect(Both.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
  })
})
