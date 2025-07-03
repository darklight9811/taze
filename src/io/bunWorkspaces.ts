import type { CommonOptions, BunWorkspaceMeta, RawDep } from '../types'
import { resolve } from 'pathe'
import { dumpDependencies, parseDependency } from './dependencies'
import { readJSON, writeJSON } from './packages'

export async function loadBunWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<BunWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw = await readJSON(filepath)

  const catalogs: BunWorkspaceMeta[] = []

  function createBunWorkspaceEntry(name: string, map: Record<string, string>): BunWorkspaceMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([pkg, version]) => parseDependency(pkg, version, 'bun-workspace', shouldUpdate))

    return {
      name,
      private: true,
      version: '',
      type: 'package.json',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
    } satisfies BunWorkspaceMeta
  }

  if (raw?.workspaces?.catalog) {
    catalogs.push(
      createBunWorkspaceEntry('bun-catalog:default', raw.workspaces.catalog),
    )
  }

  if (raw?.workspaces?.catalogs) {
    for (const key of Object.keys(raw.catalogs)) {
      catalogs.push(
        createBunWorkspaceEntry(`bun-catalog:${key}`, raw.workspaces.catalogs[key]),
      )
    }
  }

  return catalogs
}

export async function writeBunWorkspace(
  pkg: BunWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'bun-workspace')

  if (!Object.keys(versions).length)
    return

  if (pkg.name.startsWith('bun-catalog:')) {
    const catalogName = pkg.name.replace('bun-catalog:', '')
    for (const [key, targetVersion] of Object.entries(versions)) {
      pkg.context.setPackage(catalogName, key, targetVersion)
    }
  }
  else {
    const paths = pkg.name.replace('bun-workspace:', '').split(/\./g)
    for (const [key, targetVersion] of Object.entries(versions)) {
      pkg.context.setPath([...paths, key], targetVersion)
    }
  }

  if (pkg.context.hasChanged()) {
    await writeYaml(pkg, pkg.context)
  }
}

