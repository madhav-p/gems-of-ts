import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ModelDefinitionError,
  ModelParseError,
  type StringSchema,
} from '../src'
import { rangeToPattern } from '../src/parts'
import { model } from './model'

describe('URL filters', () => {
  it('filters hostnames with matches', () => {
    const linkedIn = model.URL({
      hostname: { matches: /(www\.)?linkedin\.com/ },
    })

    expect(linkedIn.parse('https://www.linkedin.com')).toBe(
      'https://www.linkedin.com',
    )
    expect(linkedIn.parse('https://linkedin.com/in/ada')).toBe(
      'https://linkedin.com/in/ada',
    )
    expect(() => linkedIn.parse('https://evil.com')).toThrow(ModelParseError)
    expect(() => linkedIn.parse('https://linkedin.com.evil.com')).toThrow(
      ModelParseError,
    )
    expect(() => linkedIn.parse('https://notlinkedin.com')).toThrow(
      ModelParseError,
    )

    const json = linkedIn.toJSONSchema() as { pattern?: string }
    const pattern = new RegExp(`^(?:${json.pattern})$`)
    expect(pattern.test('https://www.linkedin.com')).toBe(true)
    expect(pattern.test('https://evil.com')).toBe(false)
  })

  it('strips redundant anchors from matches in the emitted pattern', () => {
    const exact = model.URL({
      hostname: { matches: /^api\.example\.com$/ },
    })

    expect(exact.parse('https://api.example.com')).toBe(
      'https://api.example.com',
    )
    expect(() => exact.parse('https://www.api.example.com')).toThrow(
      ModelParseError,
    )

    const json = exact.toJSONSchema() as { pattern?: string }
    const pattern = new RegExp(`^(?:${json.pattern})$`)
    expect(pattern.test('https://api.example.com')).toBe(true)
    expect(pattern.test('https://www.api.example.com')).toBe(false)
  })

  it('supports IPv6 hostnames', () => {
    const local = model.URL({
      hostname: { eq: '[::1]' },
      port: { eq: 3000 },
    })

    expect(local.parse('http://[::1]:3000')).toBe('http://[::1]:3000')
    expect(() => local.parse('http://[::1]:3001')).toThrow(ModelParseError)
  })

  it('filters hostname and port together', () => {
    const dev = model.URL({
      hostname: { eq: '127.0.0.1' },
      port: { min: 3000, max: 5000 },
    })

    expect(dev.parse('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(dev.parse('http://127.0.0.1:5000/path')).toBe(
      'http://127.0.0.1:5000/path',
    )
    expect(() => dev.parse('http://127.0.0.1:2999')).toThrow(ModelParseError)
    expect(() => dev.parse('http://127.0.0.1:5001')).toThrow(ModelParseError)
    expect(() => dev.parse('http://127.0.0.1')).toThrow(ModelParseError)
    expect(() => dev.parse('http://localhost:3000')).toThrow(ModelParseError)
  })

  it('filters the whole host including the port', () => {
    const host = model.URL({ host: { eq: '127.0.0.1:3000' } })

    expect(host.parse('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(() => host.parse('http://127.0.0.1')).toThrow(ModelParseError)
    expect(() => host.parse('http://127.0.0.1:3001')).toThrow(ModelParseError)
  })

  it('supports text matches on the whole host', () => {
    const host = model.URL({ host: { endsWith: ':3000' } })

    expect(host.parse('http://example.com:3000')).toBe(
      'http://example.com:3000',
    )
    expect(() => host.parse('http://example.com')).toThrow(ModelParseError)
  })

  it('reports filter failures through safeParse', () => {
    const dev = model.URL({
      hostname: { eq: '127.0.0.1' },
      port: { min: 3000, max: 5000 },
    })

    const result = dev.safeParse('http://127.0.0.1:2999')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues[0]?.message).toContain('port between 3000 and 5000')
    }
  })

  it('requires an explicit port when filtering by port', () => {
    const port = model.URL({ port: { eq: 3000 } })

    expect(port.parse('http://example.com:3000')).toBe(
      'http://example.com:3000',
    )
    expect(() => port.parse('http://example.com')).toThrow(ModelParseError)
  })

  it('matches hostnames case-insensitively', () => {
    const example = model.URL({ hostname: { eq: 'example.com' } })

    expect(example.parse('https://EXAMPLE.com')).toBe('https://EXAMPLE.com')
  })

  it('supports text matches and length on a part', () => {
    const subdomain = model.URL({
      hostname: { endsWith: '.example.com', length: { min: 12 } },
    })

    expect(subdomain.parse('https://api.example.com')).toBe(
      'https://api.example.com',
    )
    expect(() => subdomain.parse('https://example.com')).toThrow(
      ModelParseError,
    )
  })

  it('emits a single pattern in JSON Schema', () => {
    const dev = model.URL({
      hostname: { eq: '127.0.0.1' },
      port: { min: 3000, max: 5000 },
    })
    const json = dev.toJSONSchema() as { pattern?: string; format?: string }

    expect(json.format).toBe('uri')
    expect(typeof json.pattern).toBe('string')
    const pattern = new RegExp(`^(?:${json.pattern})$`)
    expect(pattern.test('http://127.0.0.1:3000')).toBe(true)
    expect(pattern.test('http://127.0.0.1:5000')).toBe(true)
    expect(pattern.test('http://127.0.0.1:2999')).toBe(false)
    expect(pattern.test('http://127.0.0.1')).toBe(false)
  })

  it('combines a whole-URL pattern with filters', () => {
    const schema = model.URL({
      pattern: /\/api\//,
      hostname: { eq: 'example.com' },
    })

    expect(schema.parse('https://example.com/api/users')).toBe(
      'https://example.com/api/users',
    )
    expect(() => schema.parse('https://example.com/users')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('https://other.com/api/users')).toThrow(
      ModelParseError,
    )

    const json = schema.toJSONSchema() as { pattern?: string }
    const pattern = new RegExp(`^(?:${json.pattern})$`)
    expect(pattern.test('https://example.com/api/users')).toBe(true)
    expect(pattern.test('https://example.com/users')).toBe(false)
    expect(pattern.test('https://other.com/api/users')).toBe(false)
  })

  it('rejects impossible combinations at runtime', () => {
    expect(() =>
      model.URL({ host: { eq: 'a' }, hostname: { eq: 'b' } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() =>
      model.URL({ host: { eq: 'a' }, port: { eq: 1 } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() =>
      model.URL({ eq: 'https://a', hostname: { eq: 'a' } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() =>
      model.URL({ hostname: { eq: 'a', matches: /a/ } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() =>
      model.URL({ hostname: { matches: /a/, startsWith: 'a' } } as never),
    ).toThrow(ModelDefinitionError)
  })

  it('rejects impossible port definitions at runtime', () => {
    expect(() => model.URL({ port: { min: 5000, max: 3000 } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.URL({ port: { min: -1 } })).toThrow(ModelDefinitionError)
    expect(() => model.URL({ port: { max: 65536 } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.URL({ port: { eq: 3000.5 } })).toThrow(
      ModelDefinitionError,
    )
    expect(() =>
      model.URL({ port: { eq: 3000, min: 3000 } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() => model.URL({ port: { multipleOf: 2 } } as never)).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.URL({ port: { int: false } } as never)).toThrow(
      ModelDefinitionError,
    )
  })

  it('rejects a hostname eq that includes a port', () => {
    expect(() => model.URL({ hostname: { eq: 'example.com:3000' } })).toThrow(
      ModelDefinitionError,
    )
  })

  it('rejects part literals that contain URL delimiters', () => {
    expect(() => model.URL({ hostname: { eq: 'example.com/path' } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.URL({ host: { eq: 'example.com/path' } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.URL({ hostname: { endsWith: '/path' } })).toThrow(
      ModelDefinitionError,
    )
  })

  it('rejects unsupported part length options', () => {
    expect(() =>
      model.URL({ hostname: { length: { multipleOf: 2 } } } as never),
    ).toThrow(ModelDefinitionError)
  })

  it('rejects unknown filter options at runtime', () => {
    expect(() => model.URL({ hostnmae: { eq: 'a' } } as never)).toThrow(
      ModelDefinitionError,
    )
    expect(() =>
      model.URL({ hostname: { pattern: /a/ } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() =>
      model.URL({ hostname: { length: { maxLength: 5 } } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() => model.URL({ port: { maxLength: 5 } } as never)).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.URL({ length: 5 } as never)).toThrow(
      ModelDefinitionError,
    )
    expect(() =>
      model.URL({ length: { maxLength: 5 } } as never),
    ).toThrow(ModelDefinitionError)
  })

  it('rejects conflicting filters at compile time', () => {
    const invalid = () => {
      // @ts-expect-error host and hostname are mutually exclusive
      model.URL({ host: { eq: 'a' }, hostname: { eq: 'b' } })
      // @ts-expect-error host includes the port
      model.URL({ host: { eq: 'a' }, port: { eq: 1 } })
      // @ts-expect-error eq cannot be combined with filters
      model.URL({ eq: 'https://a', hostname: { eq: 'a' } })
      // @ts-expect-error eq and length are mutually exclusive
      model.URL({ hostname: { eq: 'a', length: { min: 1 } } })
      // @ts-expect-error matches and startsWith are mutually exclusive
      model.URL({ hostname: { matches: /a/, startsWith: 'a' } })
      // @ts-expect-error multipleOf is not supported for a port
      model.URL({ port: { multipleOf: 2 } })
      // @ts-expect-error int false is impossible for a port
      model.URL({ port: { int: false } })
      // @ts-expect-error multipleOf is not supported for a part length
      model.URL({ hostname: { length: { multipleOf: 2 } } })
    }

    expect(invalid).toBeTypeOf('function')
  })

  it('infers string output', () => {
    const schema = model.URL({ hostname: { eq: 'example.com' } })

    expectTypeOf(schema.parse('https://example.com')).toEqualTypeOf<string>()
  })

  it('is assignable to a string schema', () => {
    const schema: StringSchema<string> = model.URL({
      hostname: { eq: 'example.com' },
    })

    expect(schema.parse('https://example.com')).toBe('https://example.com')
  })
})

describe('rangeToPattern', () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [0, 9],
    [0, 10],
    [5, 15],
    [10, 99],
    [3000, 5000],
    [999, 1001],
    [65530, 65535],
    [0, 65535],
    [1234, 4321],
  ]

  it('matches exactly the integers in range', () => {
    for (const [min, max] of cases) {
      const pattern = new RegExp(`^(?:${rangeToPattern(min, max)})$`)
      const values = new Set<number>([
        min - 1,
        min,
        min + 1,
        max - 1,
        max,
        max + 1,
        Math.floor((min + max) / 2),
      ])
      if (max - min <= 1000) {
        for (let value = min; value <= max; value += 1) {
          values.add(value)
        }
      } else {
        for (let value = min; value <= max; value += 137) {
          values.add(value)
        }
      }

      for (const value of values) {
        if (value < 0) {
          continue
        }
        expect(pattern.test(String(value)), `${min}-${max}: ${value}`).toBe(
          value >= min && value <= max,
        )
      }
      expect(pattern.test(`0${min}`), `${min}-${max}: leading zero`).toBe(false)
    }
  })
})
