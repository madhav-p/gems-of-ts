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
 * Env: `NODE_AUTH_TOKEN` for npm; JSR uses GitHub OIDC (`id-token: write`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const libsDir = join(root, 'libs')

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

let failures = 0

for (const { dir, pkgPath, pkg } of packages) {
  // --- npm ---
  if (isPublishedOnNpm(pkg.name, pkg.version)) {
    console.log(`[npm] ${pkg.name}@${pkg.version} already published — skipping`)
  } else {
    console.log(`[npm] publishing ${pkg.name}@${pkg.version}`)
    try {
      run('pnpm', ['--filter', pkg.name, 'publish', '--access', 'public', '--no-git-checks'], root)
    } catch (error) {
      failures += 1
      console.error(`[npm] failed: ${pkg.name} — ${error.message}`)
    }
  }

  // --- JSR ---
  const jsrPath = join(dir, 'jsr.json')
  if (existsSync(jsrPath)) {
    const jsr = readJson(jsrPath)
    jsr.version = pkg.version
    writeJson(jsrPath, jsr)

    console.log(`[jsr] publishing ${jsr.name}@${jsr.version}`)
    try {
      withJsrDependencies(pkgPath, pkg, () => {
        run('npx', ['--yes', 'jsr', 'publish', '--allow-dirty'], dir)
      })
    } catch (error) {
      failures += 1
      console.error(`[jsr] failed: ${pkg.name} — ${error.message}`)
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} publish step(s) failed.`)
  process.exit(1)
}
console.log('\nPublish complete.')
