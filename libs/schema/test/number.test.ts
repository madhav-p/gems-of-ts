import { describe, expect, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

const t = createSchemaBuilder()
const { boolean, number } = t

describe('number rules', () => {
  it('validates inclusive bounds (min/max)', () => {
    const score = number((nv) => nv.min(0).max(10))
    expect(score.parse(5)).toBe(5)
    expect(score.parse(0)).toBe(0)
    expect(score.parse(10)).toBe(10)
    expect(() => score.parse(-1)).toThrow(SchemaParseError)
    expect(() => score.parse(11)).toThrow(SchemaParseError)
    expect(score.toJSONSchema()).toEqual({ type: 'number', minimum: 0, maximum: 10 })
  })

  it('validates exclusive bounds (gt/lt)', () => {
    const ratio = number((nv) => nv.gt(0).lt(1))
    expect(ratio.parse(0.5)).toBe(0.5)
    expect(() => ratio.parse(0)).toThrow(SchemaParseError)
    expect(() => ratio.parse(1)).toThrow(SchemaParseError)
    expect(ratio.toJSONSchema()).toEqual({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    })
  })

  it('requires an integer via int() or format("int")', () => {
    expect(number((nv) => nv.int()).toJSONSchema()).toEqual({ type: 'integer' })
    expect(number((nv) => nv.format('int')).toJSONSchema()).toEqual({ type: 'integer' })

    const points = number((nv) => nv.format('int').min(0))
    expect(points.parse(3)).toBe(3)
    expect(() => points.parse(1.5)).toThrow(SchemaParseError)
    expect(points.toJSONSchema()).toEqual({ type: 'integer', minimum: 0 })
  })

  it('rejects non-numbers', () => {
    expect(() => number().parse('5')).toThrow(SchemaParseError)
    expect(() => number().parse(NaN)).toThrow(SchemaParseError)
  })
})

describe('boolean', () => {
  it('validates and emits JSON Schema', () => {
    expect(boolean().parse(true)).toBe(true)
    expect(() => boolean().parse('true')).toThrow(SchemaParseError)
    expect(boolean().toJSONSchema()).toEqual({ type: 'boolean' })
  })
})

describe('optional and view immutability', () => {
  it('does not mutate the original when marking optional', () => {
    const base = number((nv) => nv.format('int'))
    const optional = base.optional()

    expect(base.isOptional).toBe(false)
    expect(optional.isOptional).toBe(true)
    expect(() => base.parse(undefined)).toThrow(SchemaParseError)
    expect(optional.parse(undefined)).toBeUndefined()
  })

  it('each schema built from a view records only its own rules', () => {
    const base = number()
    const min2 = number((nv) => nv.min(2))
    const min5 = number((nv) => nv.min(5))

    expect(base.toJSONSchema()).toEqual({ type: 'number' })
    expect(min2.toJSONSchema()).toEqual({ type: 'number', minimum: 2 })
    expect(min5.toJSONSchema()).toEqual({ type: 'number', minimum: 5 })

    expect(() => base.parse(1)).not.toThrow()
    expect(() => min2.parse(1)).toThrow(SchemaParseError)
  })
})
