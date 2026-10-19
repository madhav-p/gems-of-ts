import { describe, expect, expectTypeOf, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

const t = createSchemaBuilder()
const { literal, number, object } = t

describe('literal', () => {
  it('accepts only the pinned value', () => {
    const role = literal('admin')
    expect(role.parse('admin')).toBe('admin')
    expect(() => role.parse('user')).toThrow(SchemaParseError)
    expect(() => role.parse(1)).toThrow(SchemaParseError)
    expect(() => role.parse(undefined)).toThrow(SchemaParseError)
  })

  it('infers the literal type', () => {
    expectTypeOf(literal('admin').parse('admin')).toEqualTypeOf<'admin'>()
    expectTypeOf(literal(42).parse(42)).toEqualTypeOf<42>()
    expectTypeOf(literal(true).parse(true)).toEqualTypeOf<true>()
  })

  it('supports number, boolean and null literals', () => {
    expect(literal(42).parse(42)).toBe(42)
    expect(() => literal(42).parse(43)).toThrow(SchemaParseError)
    expect(literal(true).parse(true)).toBe(true)
    expect(literal(null).parse(null)).toBeNull()
    expect(() => literal(null).parse(0)).toThrow(SchemaParseError)
  })

  it('emits JSON Schema `const`', () => {
    expect(literal('admin').toJSONSchema()).toEqual({ const: 'admin' })
    expect(literal(42).toJSONSchema()).toEqual({ const: 42 })
    expect(literal(null).toJSONSchema()).toEqual({ const: null })
  })

  it('is optional-aware', () => {
    const role = literal('admin').optional()
    expect(role.isOptional).toBe(true)
    expect(role.parse(undefined)).toBeUndefined()
    expect(role.parse('admin')).toBe('admin')
  })

  it('compiles to a standalone validator', () => {
    const validate = literal('admin').compile()
    expect(validate('admin')).toBe('admin')
    expect(() => validate('user')).toThrow(SchemaParseError)
  })

  it('reports a helpful issue', () => {
    const result = literal('admin').safeParse('user')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues[0]?.message).toBe(`Expected the literal "admin", received "user"`)
    }
  })
})

describe('literal inside objects', () => {
  class Event extends object({
    kind: literal('created'),
    id: number((nv) => nv.format('int')),
  }) {}

  it('validates and reports paths', () => {
    expect(Event.parse({ kind: 'created', id: 1 }).kind).toBe('created')

    const result = Event.safeParse({ kind: 'deleted', id: 1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues.map((issue) => issue.path.join('.'))).toContain('kind')
    }
  })

  it('is enforced on mutation', () => {
    const event = Event.parse({ kind: 'created', id: 1 })
    expect(() => {
      ;(event as { kind: string }).kind = 'deleted'
    }).toThrow(SchemaParseError)
  })

  it('emits JSON Schema', () => {
    expect(Event.toJSONSchema()).toMatchObject({
      properties: { kind: { const: 'created' }, id: { type: 'integer' } },
      required: ['kind', 'id'],
    })
  })
})
