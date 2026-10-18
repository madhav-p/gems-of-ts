import { describe, expect, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

const t = createSchemaBuilder()
const { array, boolean, number, object, string } = t

const nonEmptyString = () => string((sv) => sv.length((nv) => nv.min(1)))

class Address extends object({
  street: nonEmptyString(),
  city: nonEmptyString(),
}) {}

class User extends object({
  name: nonEmptyString(),
  age: number((nv) => nv.format('int').min(0)).optional(),
  address: Address,
  tags: array(nonEmptyString()),
}) {}

const valid = {
  name: 'Ada',
  age: 36,
  address: { street: '1 Main St', city: 'Springfield' },
  tags: ['admin'],
}

function capture(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

describe('compile', () => {
  it('compiles an object to a function with the same output type as parse', () => {
    const validate: (value: unknown) => User = User.compile()
    expect(validate(valid)).toEqual(User.parse(valid))
  })

  it('returns a plain value — no class instance, no proxy', () => {
    const compiled = User.compile()(valid)
    expect(compiled instanceof User).toBe(false)
    expect(Object.getPrototypeOf(compiled)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(compiled.address)).toBe(Object.prototype)
  })

  it('rejects the same inputs with the same issues as parse', () => {
    const bad = { name: '', address: { street: '', city: 'Springfield' }, tags: [''] }

    const parseError = capture(() => User.parse(bad))
    const compileError = capture(() => User.compile()(bad))

    expect(parseError).toBeInstanceOf(SchemaParseError)
    expect(compileError).toBeInstanceOf(SchemaParseError)
    expect((compileError as SchemaParseError).issues).toEqual(
      (parseError as SchemaParseError).issues,
    )
  })

  it('compiles primitives', () => {
    expect(string((sv) => sv.length((nv) => nv.min(2))).compile()('ab')).toBe('ab')
    expect(() => string((sv) => sv.length((nv) => nv.min(2))).compile()('a')).toThrow(
      SchemaParseError,
    )
    expect(number((nv) => nv.int()).compile()(3)).toBe(3)
    expect(boolean().compile()(true)).toBe(true)
  })

  it('compiles arrays without a proxy', () => {
    const validate = array(nonEmptyString()).compile()
    const output = validate(['a', 'b'])
    expect(output).toEqual(['a', 'b'])
    expect(Array.isArray(output)).toBe(true)
    expect(Object.getPrototypeOf(output)).toBe(Array.prototype)
    expect(() => validate([''])).toThrow(SchemaParseError)
  })

  it('honours optional fields', () => {
    expect(number().optional().compile()(undefined)).toBeUndefined()
    expect(() =>
      User.compile()({ name: 'Ada', address: { street: 's', city: 'c' }, tags: [] }),
    ).not.toThrow()
  })
})
