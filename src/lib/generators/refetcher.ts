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
import { parse, ObjectTypeDefinitionNode, FieldDefinitionNode } from 'graphql'
import saveSourceFile from '../utils/saveSourceFile'
import { formatNamedImports } from '../utils/formatNamedImports'
import { CustomGqlConfig } from '../types'

type Operation = 'Query' | 'Mutation'

function getReturnType(field: FieldDefinitionNode): string {
  const isListType = get(field, 'type.type.kind') === 'ListType'
  let objectType: string = get(field, 'type.type.name.value')
  let returnType: string
  if (isListType) {
    returnType = `${objectType}[]`
  } else if (objectType === 'Boolean') {
    returnType = 'boolean'
  } else if (objectType === 'Float') {
    returnType = 'number'
  } else {
    returnType = objectType
  }
  return returnType
}

function getObjectType(field: FieldDefinitionNode): string | undefined {
  const isListType = get(field, 'type.type.kind') === 'ListType'
  let objectType: string = get(field, 'type.type.name.value')
  let type: string | undefined = undefined
  if (isListType) {
    type = get(field, 'type.type.type.type.name.value')
    return objectType
  } else if (objectType === 'Boolean') {
    // do noting
  } else if (objectType === 'Float') {
    // do noting
  } else {
    type = get(field, 'type.type.name.value')
  }
  return type
}

function getStatements(field: FieldDefinitionNode, action: string, gqlName: string): string {
  let statements: string

  const args = field.arguments || []
  const firstArgName = get(args[0], 'name.value')

  // 无参数
  if (!args.length) {
    statements = `
      const key = opt.key ? opt.key : ${gqlName}
      if (!fetcher.get(key))  {
        return console.warn('fetcher找不到' + key) as any
      }
      if (Object.keys(args).length) opt.variables = args
      if (!opt.showLoading) opt.showLoading = false
      return await fetcher.get(key).refetch(opt)
    `
    // 只有个参数并且叫 input
  } else if (args.length === 1 && firstArgName === 'input') {
    statements = `
      const key = opt.key ? opt.key : ${gqlName}
      if (!fetcher.get(key))  {
        return console.warn('fetcher找不到' + key) as any
      }
      if (Object.keys(args).length) opt.variables = {input: args}
      if (!opt.showLoading) opt.showLoading = false
      return await fetcher.get(key).refetch(opt)
    `
    // 多参数,或者不叫 input
  } else {
    statements = `
      const key = opt.key ? opt.key : ${gqlName}
      if (!fetcher.get(key))  {
        return console.warn('fetcher找不到' + key) as any
      }
      if (Object.keys(args).length) opt.variables = args
      if (!opt.showLoading) opt.showLoading = false
      return await fetcher.get(key).refetch(opt)
    `
  }
  return statements
}

function getArgsType(field: FieldDefinitionNode, operation: string, gqlName: string): string {
  const args = field.arguments || []
  const firstArgName = get(args[0], 'name.value')
  let argsType: string
  // 无参数
  if (!args.length) {
    argsType = 'any'
    // 只有个参数并且叫 input
  } else if (args.length === 1 && firstArgName === 'input') {
    argsType = get(args[0], 'type.type.name.value')

    // 多参数,或者不叫 input
  } else {
    argsType = `${capital(operation)}${pascal(gqlName)}Args`
  }
  return argsType
}

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
  customGql: CustomGqlConfig,
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

  // 有效的 alias config
  const aliasConfigs = customGql.filter((i) => refetchConfig.includes(i.alias || ''))

  // 把 alias 也转换成 name
  const realNames = refetchConfig.map((name) => {
    const find = customGql.find((i) => i.alias === name)
    return find ? find.name : name
  })

  for (const def of sdl.definitions) {
    const operation: Operation = get(def, 'name.value')
    const objectType = def as ObjectTypeDefinitionNode

    // 只处理跟节点 Query
    if (operation !== 'Query') continue
    if (!objectType.fields || !objectType.fields.length) continue

    for (const field of objectType.fields) {
      const queryName = field.name.value

      // 如果 refetchConfig 配置大于 0，就只使用 refetchConfig 配置里面的 queryName
      if (refetchConfig.length && !realNames.includes(queryName)) {
        continue
      }

      const matchingAliasConfigs = aliasConfigs.filter((i) => i.name === queryName)

      const action = operation === 'Query' ? 'useQuery' : 'useMutate'
      const gqlName = upper(queryName, '_')
      gqlNames.push(gqlName)

      const type = getObjectType(field)
      if (type) objectTypes.push(type)

      const argsType = getArgsType(field, operation, gqlName)
      const returnType = getReturnType(field)
      const statements = getStatements(field, action, gqlName)

      if (argsType !== 'any') argTypes.push(argsType)

      // 生产别名的 Hooks
      for (const item of matchingAliasConfigs) {
        const gqlName = upper(item.alias || '', '_')
        gqlNames.push(gqlName)
        const statements = getStatements(field, action, gqlName)
        methods.push({
          name: `refetch${pascal(item.alias || '')}`,
          isAsync: true,
          returnType: `Promise<${returnType}>`,
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

      // 非别名的 refetcher
      methods.push({
        name: `refetch${pascal(queryName)}`,
        isAsync: true,
        returnType: `Promise<${returnType}>`,
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
