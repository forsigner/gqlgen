import {
  Project,
  VariableDeclarationKind,
  MethodDeclarationStructure,
  OptionalKind,
} from 'ts-morph'

import { capital, pascal, upper } from 'case'
import get from 'lodash.get'
import { join } from 'path'
import { readFileSync } from 'fs'
import { parse, ObjectTypeDefinitionNode } from 'graphql'
import saveSourceFile from '../utils/saveSourceFile'
import { formatNamedImports } from '../utils/formatNamedImports'

type Operation = 'Query' | 'Mutation'
/**
 * 自动化生产 refetcher
 *
 * @export
 * @param {string} gqlConstantModule
 * @param {string[]} refetchConfig
 */
export function generateRefetcher(
  httpModule: string,
  gqlConstantModule: string,
  refetchConfig: string[],
) {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', `refetcher.ts`)
  const sdlPath = join(baseDirPath, 'src', 'generated', 'schema.graphql')
  const sdl = parse(readFileSync(sdlPath, { encoding: 'utf8' })) // GraphQL sdl string
  const sourceFile = project.createSourceFile(outPath, undefined, { overwrite: true })
  const methods: OptionalKind<MethodDeclarationStructure>[] = []
  const argTypes: string[] = []
  const objectTypes: string[] = []
  const gqlNames: string[] = [] // graphQL query name, 例如： USERS、USERS_CONECTION

  for (const def of sdl.definitions) {
    const operation: Operation = get(def, 'name.value')
    const objectType = def as ObjectTypeDefinitionNode

    // 只处理跟节点 Query
    if (operation !== 'Query') continue
    if (!objectType.fields || !objectType.fields.length) continue

    for (const field of objectType.fields) {
      let argsType: string
      let statements: string
      const queryName = field.name.value

      // 如果 refetchConfig 配置大于 0，就只使用 refetchConfig 配置里面的 queryName
      if (refetchConfig.length && !refetchConfig.includes(queryName)) {
        continue
      }

      const isListType = get(field, 'type.type.kind') === 'ListType'
      const args = field.arguments || []
      let objectType: string = get(field, 'type.type.name.value')
      let T: string // 返回的类型

      if (isListType) {
        objectType = get(field, 'type.type.type.type.name.value')
        T = `${objectType}[]`
        objectTypes.push(objectType)
      } else if (objectType === 'Boolean') {
        T = 'boolean'
      } else if (objectType === 'Float') {
        T = 'number'
      } else {
        T = objectType
        objectType = get(field, 'type.type.name.value')
        objectTypes.push(objectType)
      }

      const gqlName = upper(queryName, '_')
      const firstArgName = get(args[0], 'name.value')

      // 无参数
      if (!args.length) {
        argsType = 'any'
        statements = `
          if (!fetcher.get(${gqlName}))  {
            return console.warn('fetcher找不到${gqlName}') as any
          }
          if (Object.keys(args).length) opt.variables = args
          if (!opt.showLoading) opt.showLoading = false
          return await fetcher.get(${gqlName}).refetch(opt)
        `
        // 只有个参数并且叫 input
      } else if (args.length === 1 && firstArgName === 'input') {
        argsType = get(args[0], 'type.type.name.value')
        statements = `
          if (!fetcher.get(${gqlName}))  {
            return console.warn('fetcher找不到${gqlName}') as any
          }
          if (Object.keys(args).length) opt.variables = {input: args}
          if (!opt.showLoading) opt.showLoading = false
          return await fetcher.get(${gqlName}).refetch(opt)
        `
        // 多参数,或者不叫 input
      } else {
        argsType = `${capital(operation)}${pascal(gqlName)}Args`
        statements = `
          if (!fetcher.get(${gqlName}))  {
            return console.warn('fetcher找不到${gqlName}') as any
          }
          if (Object.keys(args).length) opt.variables = args
          if (!opt.showLoading) opt.showLoading = false
          return await fetcher.get(${gqlName}).refetch(opt)
        `
      }

      gqlNames.push(gqlName)
      if (argsType !== 'any') argTypes.push(argsType)

      methods.push({
        name: `refetch${pascal(queryName)}`,
        isAsync: true,
        returnType: `Promise<${T}>`,
        parameters: [
          {
            name: 'args',
            type: `${argsType} = {} as ${argsType}`,
          },
          {
            name: 'opt',
            type: 'RefetchOptions = {}',
          },
        ],
        statements,
      })
    }
  }

  // import stook-graphql
  sourceFile.addImportDeclaration({
    moduleSpecifier: httpModule,
    namedImports: ['RefetchOptions', 'fetcher'],
  })

  sourceFile.addImportDeclaration({
    moduleSpecifier: '@generated/types',
    namedImports: [...formatNamedImports(objectTypes, argTypes)],
  })

  sourceFile.addImportDeclaration({
    moduleSpecifier: gqlConstantModule,
    namedImports: [...formatNamedImports(gqlNames)],
  })

  sourceFile.addClass({
    name: 'RefetcherService',
    methods,
  })

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'Refetcher',
        initializer: `new RefetcherService()`,
      },
    ],
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
