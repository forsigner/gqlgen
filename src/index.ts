import { Command, flags } from '@oclif/command'
import { join, isAbsolute } from 'path'
import {
  generateGql,
  generateCustomGql,
  generateApi,
  generateHooks,
  generateRefetcher,
  CustomGqlConfig,
} from './lib'

interface UserConfig {
  gqlConstantModule: string
  query: string[]
  useQuery: string[]
  useMutate: string[]
  refetch: string[]
  customGql: CustomGqlConfig
}

class Gqlgen extends Command {
  static description = 'describe the command here'

  static flags = {
    // add --version flag to show CLI version
    version: flags.version({ char: 'v' }),
    help: flags.help({ char: 'h' }),
    // flag with a value (-n, --name=VALUE)
    config: flags.string({ char: 'c', description: 'config file path' }),
  }

  async run() {
    const { flags } = this.parse(Gqlgen)
    const { config } = flags
    if (!config) throw new Error('Require config file')
    const configPath = isAbsolute(config) ? config : join(process.cwd(), config)
    try {
      const useConfig: UserConfig = require(configPath)
      const { gqlConstantModule, query, useQuery, useMutate, refetch, customGql } = useConfig

      generateGql()
      generateCustomGql(customGql)
      generateApi(gqlConstantModule, query)
      generateHooks(gqlConstantModule, [...useQuery, ...useMutate])
      generateRefetcher(gqlConstantModule, refetch)
    } catch (error) {
      this.log('config path invalid')
    }
  }
}

export = Gqlgen
