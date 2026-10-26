import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ModelDefinitionError,
  ModelParseError,
  type StringSchema,
} from '../src'
import { model } from './model'

function patternOf(schema: StringSchema<string>): RegExp {
  const json = schema.toJSONSchema()
  if (!('pattern' in json) || json.pattern === undefined) {
    throw new Error('expected a pattern')
  }
  return new RegExp(`^(?:${json.pattern})$`)
}

describe('email filters', () => {
  it('filters the local part and domain', () => {
    const schema = model.email({
      local: { matches: /^[a-z.]+$/ },
      domain: { endsWith: '.com' },
    })

    expect(schema.parse('ada@example.com')).toBe('ada@example.com')
    expect(schema.parse('grace.hopper@sub.example.com')).toBe(
      'grace.hopper@sub.example.com',
    )
    expect(schema.parse('ada@EXAMPLE.COM')).toBe('ada@EXAMPLE.COM')
    expect(() => schema.parse('Ada@example.com')).toThrow(ModelParseError)
    expect(() => schema.parse('ada@example.org')).toThrow(ModelParseError)
  })

  it('filters internationalized email parts', () => {
    const schema = model.idnEmail({
      local: { eq: '用户' },
      domain: { eq: '例子.广告' },
    })

    expect(schema.parse('用户@例子.广告')).toBe('用户@例子.广告')
    expect(() => schema.parse('用户@例子.中国')).toThrow(ModelParseError)
    expect(() => schema.parse('其他@例子.广告')).toThrow(ModelParseError)
  })

  it('emits one pattern', () => {
    const pattern = patternOf(
      model.email({ local: { eq: 'ada' }, domain: { eq: 'example.com' } }),
    )

    expect(pattern.test('ada@example.com')).toBe(true)
    expect(pattern.test('grace@example.com')).toBe(false)
    expect(pattern.test('ada@other.com')).toBe(false)
  })
})

describe('date and time filters', () => {
  it('filters date components', () => {
    const schema = model.date({
      year: { min: 2020, max: 2024 },
      month: { eq: 2 },
      day: { eq: 29 },
    })

    expect(schema.parse('2020-02-29')).toBe('2020-02-29')
    expect(schema.parse('2024-02-29')).toBe('2024-02-29')
    expect(() => schema.parse('2019-02-28')).toThrow(ModelParseError)
    expect(() => schema.parse('2023-02-28')).toThrow(ModelParseError)
    expect(() => schema.parse('2024-03-29')).toThrow(ModelParseError)
  })

  it('rejects impossible exact dates at definition time', () => {
    expect(() =>
      model.date({
        year: { eq: 2023 },
        month: { eq: 2 },
        day: { eq: 29 },
      }),
    ).toThrow(ModelDefinitionError)
  })

  it('rejects date parts outside their domain', () => {
    expect(() => model.date({ month: { min: 13 } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.date({ day: { max: 32 } })).toThrow(
      ModelDefinitionError,
    )
  })

  it('filters time components', () => {
    const schema = model.time({
      hour: { min: 9, max: 17 },
      minute: { min: 15, max: 45 },
      second: { eq: 30 },
      offset: { eq: 'Z' },
    })

    expect(schema.parse('12:30:30Z')).toBe('12:30:30Z')
    expect(schema.parse('09:15:30Z')).toBe('09:15:30Z')
    expect(schema.parse('17:45:30Z')).toBe('17:45:30Z')
    expect(() => schema.parse('08:30:30Z')).toThrow(ModelParseError)
    expect(() => schema.parse('12:14:30Z')).toThrow(ModelParseError)
    expect(() => schema.parse('12:30:31Z')).toThrow(ModelParseError)
    expect(() => schema.parse('12:30:30+05:30')).toThrow(ModelParseError)
  })

  it('supports fraction and offset filters', () => {
    const fraction = model.time({ fraction: { length: { max: 3 } } })
    expect(fraction.parse('12:00:00.123Z')).toBe('12:00:00.123Z')
    expect(() => fraction.parse('12:00:00.1234Z')).toThrow(ModelParseError)
    expect(() => fraction.parse('12:00:00Z')).toThrow(ModelParseError)

    const offset = model.time({ offset: { matches: /[+-]05:30/ } })
    expect(offset.parse('12:00:00+05:30')).toBe('12:00:00+05:30')
    expect(() => offset.parse('12:00:00Z')).toThrow(ModelParseError)
  })

  it('filters date-time components', () => {
    const schema = model.dateTime({
      year: { min: 2020 },
      month: { eq: 2 },
      day: { eq: 29 },
      hour: { min: 9, max: 17 },
      offset: { eq: 'Z' },
    })

    expect(schema.parse('2024-02-29T12:30:00Z')).toBe(
      '2024-02-29T12:30:00Z',
    )
    expect(() => schema.parse('2024-02-29T18:30:00Z')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('2024-02-29T12:30:00+05:30')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('2019-02-28T12:30:00Z')).toThrow(
      ModelParseError,
    )
  })

  it('emits patterns for date and time', () => {
    const datePattern = patternOf(
      model.date({ year: { min: 2020 }, month: { eq: 2 }, day: { eq: 29 } }),
    )
    expect(datePattern.test('2024-02-29')).toBe(true)
    expect(datePattern.test('2019-02-28')).toBe(false)

    const timePattern = patternOf(
      model.time({ hour: { min: 9, max: 17 }, offset: { eq: 'Z' } }),
    )
    expect(timePattern.test('12:00:00Z')).toBe(true)
    expect(timePattern.test('08:00:00Z')).toBe(false)
    expect(timePattern.test('12:00:00+05:30')).toBe(false)
  })
})

describe('duration filters', () => {
  it('requires and filters integer components', () => {
    const schema = model.duration({
      years: { min: 1 },
      months: { max: 6 },
    })

    expect(schema.parse('P2Y3M')).toBe('P2Y3M')
    expect(() => schema.parse('P3M')).toThrow(ModelParseError)
    expect(() => schema.parse('P2Y')).toThrow(ModelParseError)
    expect(() => schema.parse('P2Y7M')).toThrow(ModelParseError)
  })

  it('filters time components', () => {
    const hours = model.duration({ hours: { max: 24 } })
    expect(hours.parse('PT24H')).toBe('PT24H')
    expect(hours.parse('PT1H30M')).toBe('PT1H30M')
    expect(hours.parse('PT01H')).toBe('PT01H')
    expect(() => hours.parse('P1D')).toThrow(ModelParseError)
    expect(() => hours.parse('PT25H')).toThrow(ModelParseError)

    const minutes = model.duration({ minutes: { min: 15, max: 45 } })
    expect(minutes.parse('PT30M')).toBe('PT30M')
    expect(minutes.parse('PT1H30M')).toBe('PT1H30M')
    expect(() => minutes.parse('PT1H')).toThrow(ModelParseError)
    expect(() => minutes.parse('PT10M')).toThrow(ModelParseError)
  })

  it('filters the seconds component as text', () => {
    const schema = model.duration({ seconds: { matches: /^\d+(?:\.\d+)?$/ } })

    expect(schema.parse('PT5S')).toBe('PT5S')
    expect(schema.parse('PT5.5S')).toBe('PT5.5S')
    expect(() => schema.parse('PT5M')).toThrow(ModelParseError)
  })

  it('emits one pattern', () => {
    const pattern = patternOf(model.duration({ hours: { max: 24 } }))
    expect(pattern.test('PT12H30M')).toBe(true)
    expect(pattern.test('P1D')).toBe(false)
    expect(pattern.test('PT25H')).toBe(false)
  })
})

describe('IPv4 filters', () => {
  it('filters octets', () => {
    const schema = model.ipv4({
      octet1: { eq: 192 },
      octet2: { eq: 168 },
      octet4: { eq: 1 },
    })

    expect(schema.parse('192.168.0.1')).toBe('192.168.0.1')
    expect(schema.parse('192.168.255.1')).toBe('192.168.255.1')
    expect(() => schema.parse('10.0.0.1')).toThrow(ModelParseError)
    expect(() => schema.parse('192.168.1.2')).toThrow(ModelParseError)
  })

  it('rejects impossible octets', () => {
    expect(() => model.ipv4({ octet1: { min: 256 } })).toThrow(
      ModelDefinitionError,
    )
  })

  it('emits one pattern', () => {
    const pattern = patternOf(model.ipv4({ octet1: { eq: 10 } }))
    expect(pattern.test('10.0.0.1')).toBe(true)
    expect(pattern.test('11.0.0.1')).toBe(false)
  })
})

describe('hostname filters', () => {
  it('filters the tld and label count', () => {
    const schema = model.hostname({
      tld: { eq: 'com' },
      labels: { min: 2, max: 3 },
    })

    expect(schema.parse('example.com')).toBe('example.com')
    expect(schema.parse('api.example.com')).toBe('api.example.com')
    expect(schema.parse('example.com.')).toBe('example.com.')
    expect(() => schema.parse('example.org')).toThrow(ModelParseError)
    expect(() => schema.parse('localhost')).toThrow(ModelParseError)
    expect(() => schema.parse('a.b.c.example.com')).toThrow(ModelParseError)
  })

  it('filters internationalized hostnames', () => {
    const schema = model.idnHostname({
      tld: { eq: '广告' },
      labels: { eq: 2 },
    })

    expect(schema.parse('例子.广告')).toBe('例子.广告')
    expect(() => schema.parse('例子.中国')).toThrow(ModelParseError)
    expect(() => schema.parse('广告')).toThrow(ModelParseError)
  })

  it('rejects impossible hostname filters', () => {
    expect(() => model.hostname({ tld: { eq: 'co.uk' } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.hostname({ labels: { min: 0 } })).toThrow(
      ModelDefinitionError,
    )
  })

  it('emits one pattern', () => {
    const pattern = patternOf(
      model.hostname({ tld: { eq: 'com' }, labels: { min: 2, max: 3 } }),
    )
    expect(pattern.test('example.com')).toBe(true)
    expect(pattern.test('api.example.com')).toBe(true)
    expect(pattern.test('localhost')).toBe(false)
    expect(pattern.test('a.b.example.com')).toBe(false)
  })
})

describe('UUID filters', () => {
  it('filters version and variant', () => {
    const schema = model.uuid({
      version: { eq: 4 },
      variant: { min: 8, max: 11 },
    })

    expect(schema.parse('123e4567-e89b-42d3-a456-426614174000')).toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    )
    expect(() =>
      schema.parse('123e4567-e89b-12d3-a456-426614174000'),
    ).toThrow(ModelParseError)
    expect(() =>
      schema.parse('123e4567-e89b-42d3-c456-426614174000'),
    ).toThrow(ModelParseError)
  })

  it('rejects impossible nibbles', () => {
    expect(() => model.uuid({ version: { min: 16 } })).toThrow(
      ModelDefinitionError,
    )
  })

  it('emits one pattern', () => {
    const pattern = patternOf(model.uuid({ version: { eq: 4 } }))
    expect(pattern.test('123e4567-e89b-42d3-a456-426614174000')).toBe(true)
    expect(pattern.test('123e4567-e89b-12d3-a456-426614174000')).toBe(false)
  })
})

describe('URI filters', () => {
  it('filters authority and path parts', () => {
    const schema = model.uri({
      scheme: { eq: 'https' },
      hostname: { eq: 'example.com' },
      path: { startsWith: '/api' },
      query: { eq: 'x=1' },
      fragment: { eq: 'top' },
    })

    expect(schema.parse('https://example.com/api?x=1#top')).toBe(
      'https://example.com/api?x=1#top',
    )
    expect(() => schema.parse('http://example.com/api?x=1#top')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('https://other.com/api?x=1#top')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('https://example.com/v1?x=1#top')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('https://example.com/api?y=1#top')).toThrow(
      ModelParseError,
    )
    expect(() => schema.parse('https://example.com/api?x=1#bottom')).toThrow(
      ModelParseError,
    )
  })

  it('supports opaque URIs when no authority is filtered', () => {
    const schema = model.uri({
      scheme: { eq: 'mailto' },
      path: { startsWith: 'ada@' },
    })

    expect(schema.parse('mailto:ada@example.com')).toBe(
      'mailto:ada@example.com',
    )
    expect(() => schema.parse('mailto:grace@example.com')).toThrow(
      ModelParseError,
    )
  })

  it('filters URI references', () => {
    const schema = model.uriReference({
      path: { startsWith: '/api' },
      query: { eq: 'x=1' },
    })

    expect(schema.parse('/api?x=1')).toBe('/api?x=1')
    expect(() => schema.parse('/other?x=1')).toThrow(ModelParseError)
    expect(() => schema.parse('/api?y=1')).toThrow(ModelParseError)
  })

  it('requires an authority when authority parts are filtered', () => {
    const schema = model.uri({ hostname: { eq: 'example.com' } })
    expect(schema.parse('https://example.com')).toBe('https://example.com')
    expect(() => schema.parse('mailto:ada@example.com')).toThrow(
      ModelParseError,
    )
  })

  it('supports IRI and IRI reference parts', () => {
    const iri = model.iri({
      scheme: { eq: 'https' },
      hostname: { eq: '例子.广告' },
      path: { eq: '/路径' },
    })

    expect(iri.parse('https://例子.广告/路径')).toBe(
      'https://例子.广告/路径',
    )
    expect(() => iri.parse('https://例子.广告/其他')).toThrow(ModelParseError)

    const reference = model.iriReference({ fragment: { eq: '路径' } })
    expect(reference.parse('#路径')).toBe('#路径')
    expect(() => reference.parse('#其他')).toThrow(ModelParseError)
  })

  it('emits one pattern', () => {
    const pattern = patternOf(
      model.uri({
        scheme: { eq: 'https' },
        hostname: { eq: 'example.com' },
        path: { startsWith: '/api' },
      }),
    )
    expect(pattern.test('https://example.com/api')).toBe(true)
    expect(pattern.test('http://example.com/api')).toBe(false)
    expect(pattern.test('https://example.com/v1')).toBe(false)
  })
})

describe('URL property filters', () => {
  it('filters protocol, userinfo, path, search, and hash', () => {
    const schema = model.URL({
      protocol: { eq: 'https' },
      username: { eq: 'ada' },
      password: { eq: 'secret' },
      pathname: { startsWith: '/api' },
      search: { eq: '?x=1' },
      hash: { eq: '#top' },
    })

    expect(schema.parse('https://ada:secret@example.com/api?x=1#top')).toBe(
      'https://ada:secret@example.com/api?x=1#top',
    )
    expect(() =>
      schema.parse('http://ada:secret@example.com/api?x=1#top'),
    ).toThrow(ModelParseError)
    expect(() =>
      schema.parse('https://ada:wrong@example.com/api?x=1#top'),
    ).toThrow(ModelParseError)
    expect(() =>
      schema.parse('https://ada:secret@example.com/v1?x=1#top'),
    ).toThrow(ModelParseError)
    expect(() =>
      schema.parse('https://ada:secret@example.com/api?y=1#top'),
    ).toThrow(ModelParseError)
    expect(() =>
      schema.parse('https://ada:secret@example.com/api?x=1#bottom'),
    ).toThrow(ModelParseError)
  })

  it('filters empty path, search, and hash intentionally', () => {
    const emptyPath = model.URL({ pathname: { eq: '' } })
    expect(emptyPath.parse('https://example.com')).toBe('https://example.com')
    expect(() => emptyPath.parse('https://example.com/')).toThrow(
      ModelParseError,
    )

    const search = model.URL({ search: { eq: '?x=1' } })
    expect(search.parse('https://example.com?x=1')).toBe(
      'https://example.com?x=1',
    )
    expect(() => search.parse('https://example.com')).toThrow(ModelParseError)
  })

  it('rejects protocol literals that contain delimiters', () => {
    expect(() => model.URL({ protocol: { eq: 'https:' } })).toThrow(
      ModelDefinitionError,
    )
  })
})

describe('format filter type exclusions', () => {
  it('rejects eq combined with part filters', () => {
    const invalid = () => {
      // @ts-expect-error eq cannot be combined with part filters
      model.email({ eq: 'ada@example.com', local: { eq: 'ada' } })
      // @ts-expect-error eq cannot be combined with part filters
      model.date({ eq: '2024-02-29', year: { eq: 2024 } })
      // @ts-expect-error eq cannot be combined with part filters
      model.time({ eq: '12:00:00Z', hour: { eq: 12 } })
      // @ts-expect-error eq cannot be combined with part filters
      model.duration({ eq: 'PT1H', hours: { eq: 1 } })
      // @ts-expect-error eq cannot be combined with part filters
      model.ipv4({ eq: '10.0.0.1', octet1: { eq: 10 } })
      // @ts-expect-error eq cannot be combined with part filters
      model.hostname({ eq: 'example.com', tld: { eq: 'com' } })
      // @ts-expect-error eq cannot be combined with part filters
      model.uuid({ eq: '123e4567-e89b-42d3-a456-426614174000', version: { eq: 4 } })
      // @ts-expect-error eq cannot be combined with part filters
      model.uri({ eq: 'https://example.com', scheme: { eq: 'https' } })
    }

    expect(invalid).toBeTypeOf('function')
  })

  it('rejects unsupported and unknown part options at runtime', () => {
    expect(() =>
      model.time({ minute: { multipleOf: 15 } } as never),
    ).toThrow(ModelDefinitionError)
    expect(() => model.email({ local: { pattern: /a/ } } as never)).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.date({ years: { min: 1 } } as never)).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.duration({ hour: { max: 1 } } as never)).toThrow(
      ModelDefinitionError,
    )
  })

  it('rejects eq combined with parts at runtime', () => {
    expect(() =>
      model.URL({
        eq: 'https://example.com',
        hostname: { eq: 'example.com' },
      } as never),
    ).toThrow(ModelDefinitionError)
  })

  it('keeps format schemas assignable to string schemas', () => {
    const schemas: StringSchema<string>[] = [
      model.email({ domain: { eq: 'example.com' } }),
      model.date({ year: { min: 2020 } }),
      model.time({ hour: { eq: 12 } }),
      model.dateTime({ minute: { eq: 30 } }),
      model.duration({ hours: { eq: 1 } }),
      model.ipv4({ octet1: { eq: 10 } }),
      model.hostname({ tld: { eq: 'com' } }),
      model.uuid({ version: { eq: 4 } }),
      model.URL({ hostname: { eq: 'example.com' } }),
      model.uri({ scheme: { eq: 'https' } }),
    ]

    expect(schemas).toHaveLength(10)
    expectTypeOf(schemas[0]!).toEqualTypeOf<StringSchema<string>>()
  })
})
