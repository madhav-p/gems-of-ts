import { describe, expect, it } from 'vitest'
import { createTypeBuilder, type NumberOptions } from '../src'

describe('createTypeBuilder', () => {
  it('exposes every built-in through the builder', () => {
    const model = createTypeBuilder()

    expect(model.string().parse('x')).toBe('x')
    expect(model.number().parse(1)).toBe(1)
    expect(model.int().parse(1)).toBe(1)
    expect(model.boolean().parse(true)).toBe(true)
    expect(model.null().parse(null)).toBeNull()
    expect(model.enum(['a', 'b']).parse('a')).toBe('a')
    expect(model.email().parse('a@b.com')).toBe('a@b.com')
    expect(model.uuid().parse('00000000-0000-0000-0000-000000000000')).toBe(
      '00000000-0000-0000-0000-000000000000',
    )
  })

  it('adds custom types from the callback', () => {
    const model = createTypeBuilder((tb) => ({
      slug: (validators?: { length?: NumberOptions }) =>
        tb.string({ ...validators, pattern: /^[a-z0-9-]+$/ }),
    }))

    expect(model.slug().parse('my-post')).toBe('my-post')
    expect(() => model.slug().parse('My Post')).toThrow()
  })

  it('keeps custom types scoped to a builder', () => {
    const custom = createTypeBuilder((tb) => ({
      hex: (validators?: { pattern?: RegExp }) =>
        tb.string({ ...validators, pattern: /^#[0-9a-f]{6}$/i }),
    }))

    expect(custom.hex().parse('#ff0000')).toBe('#ff0000')
    expect('hex' in createTypeBuilder()).toBe(false)
  })
})
