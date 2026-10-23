import { describe, expect, expectTypeOf, it } from 'vitest'
import { type ParseResult } from '../src'

import { model } from './model'

class User extends model.object({
  name: model.string({ length: { min: 1 } }),
  age: model.number({ min: 0 }).optional(),
}) {}

class Admin extends User {}

describe('class output', () => {
  it('builds a class for every validator', () => {
    expect(typeof model.string()).toBe('function')
    expect(typeof model.number()).toBe('function')
    expect(typeof model.boolean()).toBe('function')
    expect(typeof model.nullType()).toBe('function')
    expect(typeof model.list(model.string())).toBe('function')
    expect(typeof model.object({})).toBe('function')
  })

  it('parse returns instances of the schema class', () => {
    const user = User.parse({ name: 'Ada' })

    expect(user).toBeInstanceOf(User)
    expect(user.name).toBe('Ada')
    expectTypeOf(user).toMatchTypeOf<User>()

    const admin = Admin.parse({ name: 'Ada' })
    expect(admin).toBeInstanceOf(Admin)
    expect(admin).toBeInstanceOf(User)
    expectTypeOf(admin).toMatchTypeOf<Admin>()
  })

  it('constructs instances with new', () => {
    const user = new User({ name: 'Ada', age: 36 })

    expect(user).toBeInstanceOf(User)
    expect(user.age).toBe(36)
    expectTypeOf(user).toMatchTypeOf<User>()
  })

  it('keeps subclass methods on parsed instances', () => {
    class Person extends model.object({ name: model.string() }) {
      greet(): string {
        return `Hello ${this.name}`
      }
    }

    const person = Person.parse({ name: 'Ada' })
    expect(person.greet()).toBe('Hello Ada')
    expect(new Person({ name: 'Grace' }).greet()).toBe('Hello Grace')
  })

  it('infers safeParse to the subclass', () => {
    const result = Admin.safeParse({ name: 'Ada' })
    expectTypeOf(result).toMatchTypeOf<ParseResult<Admin>>()
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeInstanceOf(Admin)
    }

    const invalid = Admin.safeParse({ name: '' })
    expect(invalid.success).toBe(false)
    if (!invalid.success) {
      expect(invalid.issues[0]?.path).toEqual(['name'])
    }
  })

  it('builds list classes with subclass output', () => {
    class Tags extends model.list(model.string({ length: { min: 1 } })) {}

    const tags = Tags.parse(['a', 'b'])
    expect(tags).toBeInstanceOf(Tags)
    expect(Array.isArray(tags)).toBe(true)
    expect(tags).toEqual(['a', 'b'])
    expectTypeOf(tags).toMatchTypeOf<readonly string[]>()

    const result = Tags.safeParse(['a'])
    expectTypeOf(result.success).toEqualTypeOf<boolean>()
  })

  it('keeps primitive static parse/safeParse types', () => {
    const age = model.number({ min: 0 })

    expectTypeOf(age.parse(1)).toEqualTypeOf<number>()
    expectTypeOf(age.safeParse(1)).toEqualTypeOf<ParseResult<number>>()
    expectTypeOf(model.string().parse('x')).toEqualTypeOf<string>()
    expectTypeOf(model.boolean().parse(true)).toEqualTypeOf<boolean>()
    expectTypeOf(model.nullType().parse(null)).toEqualTypeOf<null>()
  })
})
