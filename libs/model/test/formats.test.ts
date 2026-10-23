import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ModelParseError,
  type EmailValidators,
  type SchemaClass,
} from '../src'
import { model } from './model'

function accepts(
  schema: SchemaClass<unknown>,
  valid: string[],
  invalid: string[],
  format: string,
): void {
  for (const value of valid) {
    expect(schema.parse(value)).toBe(value)
  }
  for (const value of invalid) {
    expect(() => schema.parse(value)).toThrow(ModelParseError)
  }
  expect(schema.toJSONSchema()).toEqual({ type: 'string', format })
}

describe('built-in string formats', () => {
  it('date-time', () => {
    accepts(
      model.dateTime(),
      ['2024-02-29T12:34:56Z', '2024-02-29t12:34:56.123+05:30', '1999-12-31T23:59:60Z'],
      ['2024-02-29 12:34:56Z', '2023-02-29T12:00:00Z', '2024-13-01T00:00:00Z'],
      'date-time',
    )
  })

  it('date', () => {
    accepts(model.date(), ['2024-02-29'], ['2023-02-29', '2024-1-01'], 'date')
  })

  it('time', () => {
    accepts(
      model.time(),
      ['23:59:59Z', '00:00:00+00:00'],
      ['24:00:00Z', '12:00:00'],
      'time',
    )
  })

  it('duration', () => {
    accepts(
      model.duration(),
      ['P3Y6M4DT12H30M5S', 'P1W', 'PT5M'],
      ['P', 'PT', '1Y'],
      'duration',
    )
  })

  it('email', () => {
    accepts(
      model.email(),
      ['ada@example.com', 'a.b+c@sub.example.co.uk'],
      ['not-an-email', 'a@', '@example.com'],
      'email',
    )
  })

  it('idn-email', () => {
    accepts(model.idnEmail(), ['用户@例子.广告'], ['not-an-email'], 'idn-email')
  })

  it('hostname', () => {
    accepts(
      model.hostname(),
      ['example.com', 'localhost'],
      ['-bad.com', 'a..b'],
      'hostname',
    )
  })

  it('idn-hostname', () => {
    accepts(model.idnHostname(), ['例子.广告'], ['-例子.广告'], 'idn-hostname')
  })

  it('ipv4', () => {
    accepts(
      model.ipv4(),
      ['0.0.0.0', '192.168.1.1'],
      ['256.1.1.1', '01.2.3.4'],
      'ipv4',
    )
  })

  it('ipv6', () => {
    accepts(
      model.ipv6(),
      ['::1', '2001:db8::1', '::ffff:192.0.2.1'],
      ['1::2::3', 'gggg::1'],
      'ipv6',
    )
  })

  it('uri', () => {
    accepts(
      model.uri(),
      ['https://example.com/a?b=c#d', 'mailto:ada@example.com'],
      ['not a uri', 'example.com'],
      'uri',
    )
  })

  it('URL aliases uri', () => {
    expect(model.URL().toJSONSchema()).toEqual({ type: 'string', format: 'uri' })
  })

  it('uri-reference', () => {
    accepts(
      model.uriReference(),
      ['', '/path', '#frag'],
      ['has space', '/path/%zz'],
      'uri-reference',
    )
  })

  it('iri', () => {
    accepts(model.iri(), ['https://例子.广告/路径'], ['not an iri'], 'iri')
  })

  it('iri-reference', () => {
    accepts(model.iriReference(), ['/路径'], ['/路 径'], 'iri-reference')
  })

  it('uuid', () => {
    accepts(
      model.uuid(),
      ['00000000-0000-0000-0000-000000000000'],
      ['not-a-uuid'],
      'uuid',
    )
  })

  it('uri-template', () => {
    accepts(
      model.uriTemplate(),
      ['https://example.com/{id}', '{?q,lang}'],
      ['https://example.com/{', 'has space/{id}'],
      'uri-template',
    )
  })

  it('json-pointer', () => {
    accepts(model.jsonPointer(), ['', '/foo/0'], ['/foo/~2'], 'json-pointer')
  })

  it('relative-json-pointer', () => {
    accepts(
      model.relativeJsonPointer(),
      ['0', '1/foo', '0#'],
      ['01/foo', '-1/foo'],
      'relative-json-pointer',
    )
  })

  it('regex', () => {
    accepts(model.regex(), ['^[a-z]+$', '\\d+'], ['(unclosed'], 'regex')
  })
})

describe('format validators', () => {
  it('combines a format with string constraints', () => {
    const email = model.email({ length: { max: 50 } })

    expect(email.parse('ada@example.com')).toBe('ada@example.com')
    expect(() => email.parse(`${'a'.repeat(45)}@example.com`)).toThrow(
      ModelParseError,
    )
    expect(email.toJSONSchema()).toEqual({
      type: 'string',
      maxLength: 50,
      format: 'email',
    })
  })

  it('types format validators separately from string options', () => {
    model.email({ length: { min: 1 } })
    model.email({ pattern: /^[a-z@.]+$/ })
    model.email({ eq: 'ada@example.com' })

    const invalid = () => {
      // @ts-expect-error format is not part of EmailValidators
      model.email({ format: 'email' })
      // @ts-expect-error eq and length are mutually exclusive
      model.email({ eq: 'ada@example.com', length: { min: 1 } })
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('supports a user-defined email wrapper', () => {
    const email = (emailValidators?: EmailValidators) =>
      model.string({ ...emailValidators, format: 'email' })

    expect(email().parse('ada@example.com')).toBe('ada@example.com')
    expect(email({ length: { max: 50 } }).toJSONSchema()).toEqual({
      type: 'string',
      maxLength: 50,
      format: 'email',
    })
  })

  it('supports the integer format', () => {
    const int = model.int({ min: 0 })

    expect(int.parse(1)).toBe(1)
    expect(() => int.parse(1.5)).toThrow(ModelParseError)
    expect(() => int.parse(-1)).toThrow(ModelParseError)
    expect(int.toJSONSchema()).toEqual({ type: 'integer', minimum: 0 })
    expectTypeOf(int.parse(1)).toEqualTypeOf<number>()

    const invalid = () => {
      // @ts-expect-error int is fixed by model.int
      model.int({ int: false })
      // @ts-expect-error eq and min are mutually exclusive
      model.int({ eq: 1, min: 0 })
    }
    expect(invalid).toBeTypeOf('function')
  })
})
