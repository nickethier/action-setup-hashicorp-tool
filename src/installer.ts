import * as core from '@actions/core'
import * as httpm from '@actions/http-client'
import * as semver from 'semver'
import * as tc from '@actions/tool-cache'
import os from 'os'

const DEFAULT_RELEASES_URL = 'https://releases.hashicorp.com'
const HTTP_USER_AGENT = 'action-setup-hashicorp-tool'

interface Build {
  arch: string
  filename: string
  name: string
  os: string
  url: string
  version: string
}

interface Version {
  name: string
  shasums: string
  shasums_signature: string
  version: string

  builds: Build[]
}

interface MetadataIndex {
  name: string
  versions: Versions
}

interface Versions {
  [version: string]: Version
}

interface Metadata {
  [name: string]: MetadataIndex
}

export function releasesUrl(): string {
  return core.getInput('releases_url') || DEFAULT_RELEASES_URL
}

let cachedMetadata: Metadata

async function getMetadata(
  product: string
): Promise<MetadataIndex | undefined> {
  if (cachedMetadata != null) {
    return new Promise<MetadataIndex>(resolve => {
      resolve(cachedMetadata[product])
    })
  }

  const http = new httpm.HttpClient(HTTP_USER_AGENT, [], {
    allowRetries: true,
    maxRetries: 5
  })

  try {
    const resp = await http.getJson<Metadata>(`${releasesUrl()}/index.json`)

    if (resp.result) {
      cachedMetadata = resp.result
    }

    return cachedMetadata[product] || undefined
  } catch (err) {
    throw new Error(`Failed to fetch version metadata file ${err}`)
  }
}

/**
 * @param versionSpec The version defined by a user in a semver compatible format
 * @param versions A list of available versions for the product
 *
 * @returns The most relevant version based on the supplied version selector
 */
export function matchVersion(versionSpec: string, versions: string[]): string {
  // from @actions/tool-cache
  let version = ''

  versions = versions.sort((a, b) => {
    if (semver.gt(a, b)) {
      return 1
    }
    return -1
  })

  // check for exact match first
  for (const potential of versions) {
    if (potential === versionSpec) {
      return potential
    }
  }

  for (let i = versions.length - 1; i >= 0; i--) {
    const potential: string = versions[i]
    const satisfied: boolean = semver.satisfies(potential, versionSpec)
    if (satisfied && matchVersionBuild(versionSpec, potential)) {
      version = potential
      break
    }
  }

  if (version) {
    core.debug(`found version match: ${version}`)
  } else {
    core.debug(`version match not found for ${version}`)
  }

  return version
}

function matchVersionBuild(versionSpec: string, version: string): boolean {
  for (const build of semver.parse(version)?.build || []) {
    if (build.startsWith('ent')) {
      return versionSpec.includes('+ent')
    }
  }
  return !versionSpec.includes('+ent')
}

/**
 * @param versionSpec The version defined by a user in a semver compatible format
 *
 * @returns Metadata about a version found by matching the semver spec against
 * available versions on the release URL
 */
async function getVersion(
  product: string,
  versionSpec: string
): Promise<Version | undefined> {
  core.debug('downloading release metadata to determine latest version')

  // Our lowest possible release value
  const meta = await getMetadata(product)

  const versions: string[] = []

  if (!meta?.versions) {
    core.setFailed(`response does not contain versions. ${meta?.versions}`)
    return
  }

  // Populate versions array
  for (const version of Object.values(meta.versions)) {
    versions.push(version.version)
  }

  // Match a version based on the version spec
  const version = matchVersion(versionSpec, versions)

  return meta.versions[version]
}

/**
 * @param configuredVersion The version defined by a user in a semver compatible format
 *
 * @returns The toolpath where the binary is stored after being downloaded based
 * on the version
 */
export async function getBinary(
  product: string,
  configuredVersion: string
): Promise<string> {
  const version = await getVersion(product, configuredVersion)

  if (!version?.version) {
    throw new Error(`${product} version '${configuredVersion}' does not exist`)
  }

  // Tool path caches based on version
  let toolPath: string
  toolPath = tc.find(product, version.version, os.arch())

  if (toolPath) {
    // If the toolpath exists, return it instead of download the product
    core.info(`found in cache: ${toolPath}`)
    return toolPath
  }

  // Determine the environment platform and architecture
  const platform: string = os.platform()
  const arch: string = os.arch()

  // Golang arch and platform (and as a result the product binaries) do not match
  // naming returned by the os package, so translate those
  const goArch = (): string => {
    switch (arch) {
      case 'x64':
        return 'amd64'
      case 'x32':
        return '386'
      default:
        return arch
    }
  }

  const goPlatform = (): string => {
    switch (platform) {
      case 'win32':
        return 'windows'
      default:
        return platform
    }
  }

  core.info(`downloading ${product}@${version.version} from ${releasesUrl()}`)

  try {
    // Download the product
    toolPath = await tc.downloadTool(
      `${releasesUrl()}/${product}/${version?.version}/${product}_${
        version?.version
      }_${goPlatform()}_${goArch()}.zip`
    )
  } catch (error) {
    throw new Error(`Failed to download product: ${error}`)
  }

  // Extract the zip
  const extractedPath = await tc.extractZip(toolPath)

  // Installs into the tool cachedir
  const dir = await tc.cacheDir(
    extractedPath,
    product,
    version.version,
    os.arch()
  )

  return dir
}
