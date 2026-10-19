#!/usr/bin/env node
/**
 * Publishes every non-private package under `libs/*` to **npm** and **JSR**.
 *
 * A package is only published when its current version is not yet on npm, so
 * this is safe to run on every push to `main` — it is effectively
 * "publish on change" (bump the version to release).
 *
 *   npm  -> `pnpm publish` (pnpm rewrites `workspace:*` deps to real versions)
 *   jsr  -> `jsr publish`  (workspace deps are rewritten to `jsr:` specifiers)
 *
 * Packages are processed in dependency order (fewest workspace deps first) so a
 * dependency is published before its dependents.
 *
 * Credentials:
 *   - npm needs `NODE_AUTH_TOKEN`; without it the npm step is skipped.
 *   - JSR uses GitHub OIDC by default, or `JSR_TOKEN` when provided. JSR failures
 *     are logged as warnings — JSR registration isn't detectable from secrets.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const libsDir = join(root, 'libs')

const npmToken = process.env.NODE_AUTH_TOKEN
const jsrToken = process.env.JSR_TOKEN

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)

function run(cmd, args, cwd, { capture = false } = {}) {
  return execFileSync(cmd, args, {
    cwd,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  })
}

function isPublishedOnNpm(name, version) {
  try {
    return (
      run('npm', ['view', `${name}@${version}`, 'version'], root, { capture: true }).trim().length > 0
    )
  } catch {
    return false
  }
}

/** Temporarily rewrites `workspace:*` deps to `jsr:` specifiers, then restores. */
function withJsrDependencies(pkgPath, pkg, fn) {
  const original = readFileSync(pkgPath, 'utf8')
  const dependencies = { ...(pkg.dependencies ?? {}) }
  let patched = false

  for (const [dep, range] of Object.entries(dependencies)) {
    if (typeof range === 'string' && range.startsWith('workspace:')) {
      const sibling = readJson(join(libsDir, dep.split('/')[1], 'package.json'))
      dependencies[dep] = `jsr:${dep}@^${sibling.version}`
      patched = true
    }
  }

  if (patched) {
    writeJson(pkgPath, { ...pkg, dependencies })
  }
  try {
    return fn()
  } finally {
    if (patched) {
      writeFileSync(pkgPath, original)
    }
  }
}

const workspaceDeps = (pkg) =>
  Object.values(pkg.dependencies ?? {}).filter(
    (range) => typeof range === 'string' && range.startsWith('workspace:'),
  )

const packages = readdirSync(libsDir)
  .map((entry) => ({
    dir: join(libsDir, entry),
    pkgPath: join(libsDir, entry, 'package.json'),
  }))
  .filter(({ pkgPath }) => existsSync(pkgPath))
  .map((entry) => ({ ...entry, pkg: readJson(entry.pkgPath) }))
  .filter(({ pkg }) => !pkg.private && pkg.name && pkg.version)
  .sort((a, b) => workspaceDeps(a.pkg).length - workspaceDeps(b.pkg).length)

let npmFailures = 0

if (!npmToken) {
  console.log('[npm] NODE_AUTH_TOKEN is not set — skipping npm publish.')
}

for (const { dir, pkgPath, pkg } of packages) {
  // --- npm ---
  if (npmToken && !isPublishedOnNpm(pkg.name, pkg.version)) {
    console.log(`[npm] publishing ${pkg.name}@${pkg.version}`)
    try {
      run('pnpm', ['--filter', pkg.name, 'publish', '--access', 'public', '--no-git-checks'], root)
    } catch (error) {
      npmFailures += 1
      console.error(`[npm] failed: ${pkg.name} — ${error.message}`)
    }
  } else if (npmToken) {
    console.log(`[npm] ${pkg.name}@${pkg.version} already published — skipping`)
  }

  // --- JSR ---
  const jsrPath = join(dir, 'jsr.json')
  if (existsSync(jsrPath)) {
    const jsr = readJson(jsrPath)
    jsr.version = pkg.version
    writeJson(jsrPath, jsr)

    console.log(`[jsr] publishing ${jsr.name}@${jsr.version}`)
    try {
      const args = ['--yes', 'jsr', 'publish', '--allow-dirty']
      if (jsrToken) {
        args.push('--token', jsrToken)
      }
      withJsrDependencies(pkgPath, pkg, () => {
        run('npx', args, dir)
      })
    } catch (error) {
      console.warn(`[jsr] skipped ${pkg.name}: ${error.message}`)
    }
  }
}

if (npmFailures > 0) {
  console.error(`\n${npmFailures} npm publish step(s) failed.`)
  process.exit(1)
}
console.log('\nPublish complete.')
