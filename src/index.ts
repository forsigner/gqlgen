import { Command, flags } from '@oclif/command'
import { join, isAbsolute } from 'path'
import {
  generateGql,
  generateCustomGql,
  generateApi,
  generateHooks,
  generateRefetcher,
  CustomGqlConfig,
  generateModalContainer,
  generateModalService,
  generateDrawerContainer,
  generateDrawerService,
  generateStore,
  CommonConfig,
} from './lib'

interface UserConfig {
  httpModule: string
  isGenerateGql: boolean
  isGenerateModal: boolean
  isGenerateDrawer: boolean
  gqlConstantModule: string
  query: string[]
  useQuery: string[]
  useMutate: string[]
  refetch: string[]
  defaultDepthLimit: number
  customGql: CustomGqlConfig
  commonGql: CommonConfig
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
      const {
        gqlConstantModule,
        httpModule = 'stook-graphql',
        isGenerateGql = true,
        isGenerateModal = false,
        isGenerateDrawer = false,
        query,
        useQuery,
        useMutate,
        refetch,
        customGql,
        commonGql = [],
        defaultDepthLimit = 2,
      } = useConfig

      if (isGenerateGql) generateGql(commonGql, defaultDepthLimit)
      generateCustomGql(customGql)
      generateHooks(httpModule, gqlConstantModule, [...useQuery, ...useMutate], customGql)
      generateApi(httpModule, gqlConstantModule, query, customGql)
      generateRefetcher(httpModule, gqlConstantModule, refetch, customGql)
      generateStore()

      if (isGenerateModal) {
        generateModalContainer()
        generateModalService()
      }

      if (isGenerateDrawer) {
        generateDrawerContainer()
        generateDrawerService()
      }
    } catch (error) {
      console.log('error:', error)
    }
  }
}

export = Gqlgen
