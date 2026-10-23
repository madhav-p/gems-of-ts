import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError, type NumberOptions } from '../src'

import { model } from './model'

describe('number', () => {
  it('accepts any finite number by default', () => {
    expect(model.number().parse(1.5)).toBe(1.5)
    expect(model.number({}).parse(-10)).toBe(-10)
    expect(model.number().toJSONSchema()).toEqual({ type: 'number' })
  })

  it('enforces inclusive bounds', () => {
    const age = model.number({ min: 0, max: 120 })

    expect(age.parse(0)).toBe(0)
    expect(age.parse(120)).toBe(120)
    expect(() => age.parse(-1)).toThrow(ModelParseError)
    expect(() => age.parse(121)).toThrow(ModelParseError)
    expect(age.toJSONSchema()).toEqual({ type: 'number', minimum: 0, maximum: 120 })
  })

  it('enforces exclusive bounds', () => {
    const ratio = model.number({ gt: 0, lt: 1 })

    expect(ratio.parse(0.5)).toBe(0.5)
    expect(() => ratio.parse(0)).toThrow(ModelParseError)
    expect(() => ratio.parse(1)).toThrow(ModelParseError)
    expect(ratio.toJSONSchema()).toEqual({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    })
  })

  it('mixes inclusive and exclusive bounds', () => {
    const lowerInclusive = model.number({ min: 0, lt: 10 })
    expect(lowerInclusive.parse(0)).toBe(0)
    expect(() => lowerInclusive.parse(10)).toThrow(ModelParseError)

    const upperInclusive = model.number({ gt: 0, max: 10 })
    expect(upperInclusive.parse(10)).toBe(10)
    expect(() => upperInclusive.parse(0)).toThrow(ModelParseError)
  })

  it('allows a single-value inclusive range', () => {
    const five = model.number({ min: 5, max: 5 })
    expect(five.parse(5)).toBe(5)
    expect(() => five.parse(6)).toThrow(ModelParseError)
  })

  it('enforces an exact value', () => {
    const answer = model.number({ eq: 42 })

    expect(answer.parse(42)).toBe(42)
    expect(() => answer.parse(41)).toThrow(ModelParseError)
    expect(answer.toJSONSchema()).toEqual({ const: 42 })
  })

  it('infers the literal type for eq', () => {
    const answer = model.number({ eq: 42 })
    expectTypeOf(answer.parse(42)).toEqualTypeOf<42>()
    expectTypeOf(answer.safeParse(41)).toEqualTypeOf<
      | { success: true; data: 42 }
      | { success: false; issues: Array<{ path: Array<string | number>; message: string }> }
    >()

    const range = model.number({ min: 0, max: 10 })
    expectTypeOf(range.parse(0)).toEqualTypeOf<number>()
  })

  it('enforces integers', () => {
    const count = model.number({ int: true })

    expect(count.parse(3)).toBe(3)
    expect(() => count.parse(1.5)).toThrow(ModelParseError)
    expect(count.toJSONSchema()).toEqual({ type: 'integer' })
  })

  it('combines int with bounds and eq', () => {
    const id = model.number({ int: true, min: 1 })
    expect(id.parse(1)).toBe(1)
    expect(() => id.parse(1.5)).toThrow(ModelParseError)
    expect(() => id.parse(0)).toThrow(ModelParseError)

    const zero = model.number({ int: true, eq: 0 })
    expect(zero.parse(0)).toBe(0)
    expectTypeOf(zero.parse(0)).toEqualTypeOf<0>()
  })

  it('enforces multipleOf', () => {
    const even = model.number({ multipleOf: 2 })

    expect(even.parse(4)).toBe(4)
    expect(even.parse(0)).toBe(0)
    expect(() => even.parse(3)).toThrow(ModelParseError)
    expect(even.toJSONSchema()).toEqual({ type: 'number', multipleOf: 2 })

    const decimal = model.number({ multipleOf: 0.1 })
    expect(decimal.parse(0.3)).toBe(0.3)
    expect(() => decimal.parse(0.35)).toThrow(ModelParseError)
  })

  it('combines multipleOf with bounds and int', () => {
    const even = model.number({ int: true, multipleOf: 2, min: 0, max: 5 })
    expect(even.parse(4)).toBe(4)
    expect(() => even.parse(3)).toThrow(ModelParseError)
    expect(() => even.parse(6)).toThrow(ModelParseError)

    const byFive = model.int({ multipleOf: 5 })
    expect(byFive.parse(10)).toBe(10)
    expect(() => byFive.parse(7)).toThrow(ModelParseError)
  })

  it('reports issues through safeParse', () => {
    const result = model.number({ min: 0, max: 10 }).safeParse(11)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual([
        { path: [], message: 'Expected a value of at most 10' },
      ])
    }

    expect(model.number({ eq: 42 }).safeParse(42)).toEqual({ success: true, data: 42 })
  })

  it('rejects non-numbers and non-finite values', () => {
    expect(() => model.number().parse('5')).toThrow(ModelParseError)
    expect(() => model.number().parse(NaN)).toThrow(ModelParseError)
    expect(() => model.number().parse(Infinity)).toThrow(ModelParseError)
    expect(() => model.number().parse(-Infinity)).toThrow(ModelParseError)
  })
})

describe('definition errors (states TypeScript cannot express)', () => {
  it('rejects an inverted range', () => {
    expect(() => model.number({ min: 10, max: 0 })).toThrow(ModelDefinitionError)
    expect(() => model.number({ min: 10, max: 0 })).toThrow(
      'lower bound must not exceed upper bound',
    )
  })

  it('rejects an empty range', () => {
    expect(() => model.number({ gt: 1, lt: 1 })).toThrow('the range is empty')
    expect(() => model.number({ min: 1, lt: 1 })).toThrow('the range is empty')
    expect(() => model.number({ gt: 1, max: 1 })).toThrow('the range is empty')
  })

  it('rejects non-finite options', () => {
    expect(() => model.number({ min: Infinity })).toThrow('must be a finite number')
    expect(() => model.number({ max: NaN })).toThrow('must be a finite number')
    expect(() => model.number({ eq: Infinity })).toThrow('must be a finite number')
  })

  it('rejects invalid multipleOf options', () => {
    expect(() => model.number({ multipleOf: 0 })).toThrow(
      '"multipleOf" must be greater than 0',
    )
    expect(() => model.number({ multipleOf: -1 })).toThrow(
      '"multipleOf" must be greater than 0',
    )
    expect(() => model.number({ multipleOf: Infinity })).toThrow(
      '"multipleOf" must be a finite number',
    )
    expect(() => model.number({ multipleOf: NaN })).toThrow(
      '"multipleOf" must be a finite number',
    )
    expect(() => model.number({ eq: 5, multipleOf: 2 })).toThrow(
      '"eq" must be a multiple of "multipleOf"',
    )
  })

  it('rejects a non-integer eq when int is true', () => {
    expect(() => model.number({ eq: 1.5, int: true })).toThrow(
      '"eq" must be an integer when "int" is true',
    )
  })

  it('rejects mutually exclusive options that bypassed the type system', () => {
    expect(() => model.number({ eq: 1, min: 0 } as unknown as NumberOptions)).toThrow(
      '"eq" cannot be combined with bounds',
    )
    expect(() => model.number({ min: 0, gt: 1 } as unknown as NumberOptions)).toThrow(
      'use either "min" or "gt", not both',
    )
    expect(() => model.number({ max: 10, lt: 5 } as unknown as NumberOptions)).toThrow(
      'use either "max" or "lt", not both',
    )
  })
})

describe('option types', () => {
  it('accepts every valid shape', () => {
    model.number()
    model.number({})
    model.number({ min: 0 })
    model.number({ max: 10 })
    model.number({ gt: 0 })
    model.number({ lt: 10 })
    model.number({ min: 0, max: 10 })
    model.number({ min: 0, lt: 10 })
    model.number({ gt: 0, max: 10 })
    model.number({ gt: 0, lt: 10 })
    model.number({ eq: 42 })
    model.number({ eq: 42, int: true })
    model.number({ int: true })
    model.number({ multipleOf: 2 })
    model.number({ min: 0, multipleOf: 5 })
    model.int({ multipleOf: 2 })
  })

  it('rejects eq combined with a bound', () => {
    const invalid = () => {
      // @ts-expect-error eq and min are mutually exclusive
      model.number({ eq: 1, min: 0 })
      // @ts-expect-error eq and max are mutually exclusive
      model.number({ eq: 1, max: 2 })
      // @ts-expect-error eq and gt are mutually exclusive
      model.number({ eq: 1, gt: 0 })
      // @ts-expect-error eq and lt are mutually exclusive
      model.number({ eq: 1, lt: 2 })
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('rejects both spellings of the same bound', () => {
    const invalid = () => {
      // @ts-expect-error min and gt are both lower bounds
      model.number({ min: 0, gt: 1 })
      // @ts-expect-error max and lt are both upper bounds
      model.number({ max: 10, lt: 5 })
    }
    expect(invalid).toBeTypeOf('function')
  })
})
