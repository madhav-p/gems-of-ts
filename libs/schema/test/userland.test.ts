import { describe, expect, it } from 'vitest'
import { createSchemaBuilder } from '../src'

const isIPv4 = (value: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((part) => Number(part) <= 255)

// A userland builder: built-in formats plus a custom `ip` format.
const t = createSchemaBuilder({
  stringFormats: {
    ip: {
      validate: (value) => (isIPv4(value) ? undefined : 'Expected a valid IPv4 address'),
      jsonFormat: 'ipv4',
    },
  },
})

class User extends t.object({
  id: t.number(),
  points: t.number((nv) => nv.format('int').min(0)),
  name: t.string((sv) => sv.length((nv) => nv.min(5).max(20)).matches(/^[a-zA-Z]+$/)),
  email: t.string((sv) =>
    sv.length((nv) => nv.max(50)).format('email', { domain: (sv) => sv.matches(/^example.com$/) }),
  ),
  website: t.string((sv) => sv.length((nv) => nv.max(100)).format('url')),
  linkedInURL: t
    .string((sv) =>
      sv
        .length((nv) => nv.max(100))
        .format('url', { host: (sv) => sv.matches(/^(www\.)?linkedin.com$/) }),
    )
    .optional(),
}) {}

class Device extends t.object({
  name: t.string((sv) => sv.length((nv) => nv.min(1))),
  address: t.string((sv) => sv.format('ip')),
}) {}

const valid = {
  id: 1,
  points: 10,
  name: 'Adaline',
  email: 'ada@example.com',
  website: 'https://ada.dev',
  linkedInURL: 'https://www.linkedin.com/in/ada',
}

describe('userland api', () => {
  it('parses a valid user into a class instance', () => {
    const user = User.parse(valid)
    expect(user).toBeInstanceOf(User)
    expect(user.name).toBe('Adaline')
    expect(user.email).toBe('ada@example.com')
    expect(user.points).toBe(10)
  })

  it('enforces format part refinements (email domain, url host)', () => {
    expect(() => User.parse({ ...valid, email: 'ada@other.com' })).toThrow()
    expect(() => User.parse({ ...valid, linkedInURL: 'https://example.com/in/ada' })).toThrow()
    expect(() => User.parse({ ...valid, website: 'not a url' })).toThrow()
  })

  it('enforces length and pattern constraints', () => {
    const tooShort = User.safeParse({ ...valid, name: 'ab' })
    expect(tooShort.success).toBe(false)
    if (!tooShort.success) {
      expect(tooShort.issues.map((issue) => issue.path.join('.'))).toContain('name')
    }
    expect(User.safeParse({ ...valid, name: 'Ada99' }).success).toBe(false)
  })

  it('omits an absent optional field', () => {
    const user = User.parse({
      id: valid.id,
      points: valid.points,
      name: valid.name,
      email: valid.email,
      website: valid.website,
    })
    expect(user.linkedInURL).toBeUndefined()
  })

  it('emits JSON Schema for the formats', () => {
    expect(User.toJSONSchema()).toMatchObject({
      type: 'object',
      properties: {
        email: { type: 'string', maxLength: 50, format: 'email' },
        website: { type: 'string', maxLength: 100, format: 'uri' },
        linkedInURL: { type: 'string', maxLength: 100, format: 'uri' },
      },
    })
  })
})

describe('custom "ip" format (userland)', () => {
  it('validates IPv4 addresses', () => {
    const device = Device.parse({ name: 'router', address: '192.168.0.1' })
    expect(device).toBeInstanceOf(Device)
    expect(device.address).toBe('192.168.0.1')

    expect(() => Device.parse({ name: 'router', address: '999.1.1.1' })).toThrow()
    expect(() => Device.parse({ name: 'router', address: 'not-an-ip' })).toThrow()
    expect(() => Device.parse({ name: 'router', address: 42 })).toThrow()
  })

  it('emits the registered JSON Schema format', () => {
    expect(Device.toJSONSchema()).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        address: { type: 'string', format: 'ipv4' },
      },
      required: ['name', 'address'],
      additionalProperties: false,
    })
  })
})
