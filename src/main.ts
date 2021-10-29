import * as core from '@actions/core'
import {getBinary} from './installer'

async function run(): Promise<void> {
  try {
    const product = core.getInput('product')
    const versionSpec = core.getInput('version')

    const path = await getBinary(product, versionSpec)

    core.addPath(path)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
