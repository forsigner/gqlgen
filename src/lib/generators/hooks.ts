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
  const returnType = getReturnType(field)
  const firstArgName = get(args[0], 'name.value')

  // 无参数
  if (!args.length) {
    statements = `return ${action}<${returnType}>(${gqlName}, { ...opt, variables: args||{} })`
    // 只有个参数并且叫 input
  } else if (args.length === 1 && firstArgName === 'input') {
    statements = `
          return ${action}<${returnType}>(${gqlName}, { ...opt, variables: () => {
            const params = typeof args === 'function' ? args() : args
            return { input: params }
          }})
        `
    // 多参数,或者不叫 input
  } else {
    statements = `return ${action}<${returnType}>(${gqlName}, { ...opt, variables: args||{} })`
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

export function generateHooks(
  httpModule: string,
  gqlConstantModule: string,
  hooksConfig: string[],
  customGql: CustomGqlConfig,
) {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', `hooks.ts`)
  const sdlPath = join(baseDirPath, 'src', 'generated', 'schema.graphql')
  const sdl = parse(readFileSync(sdlPath, { encoding: 'utf8' })) // GraphQL sdl string
  const sourceFile = project.createSourceFile(outPath, undefined, { overwrite: true })
  const methods: OptionalKind<MethodDeclarationStructure>[] = []
  const argTypes: string[] = [] // GraphQL 的arg类型参数
  const gqlNames: string[] = [] // graphQL query name, 例如： USERS、USERS_CONECTION

  const aliasConfigs = customGql.filter((i) => hooksConfig.includes(i.alias || ''))
  let objectTypes: string[] = []

  for (const def of sdl.definitions) {
    const operation: Operation = get(def, 'name.value')
    const objectType = def as ObjectTypeDefinitionNode

    // 只处理跟节点 Query、Mutation
    if (!['Query', 'Mutation'].includes(operation)) continue
    if (!objectType.fields || !objectType.fields.length) continue

    for (const field of objectType.fields) {
      const queryName = field.name.value // 节点名称

      // 如果 hookConfig 配置大于 0，就只使用 hook 配置里面的 queryName
      if (hooksConfig.length && !hooksConfig.includes(queryName)) {
        continue
      }

      const gqlName = upper(queryName, '_')
      gqlNames.push(gqlName)

      const action = operation === 'Query' ? 'useQuery' : 'useMutate'
      const statements = getStatements(field, action, gqlName)
      const argsType = getArgsType(field, operation, gqlName)
      const type = getObjectType(field)
      if (type) objectTypes.push(type)

      if (argsType !== 'any') argTypes.push(argsType)

      const matchingAliasConfigs = aliasConfigs.filter((i) => i.name === queryName)

      // 生产别名的 Hooks
      for (const item of matchingAliasConfigs) {
        const gqlName = upper(item.alias || '', '_')
        gqlNames.push(gqlName)
        const statements = getStatements(field, action, gqlName)
        methods.push({
          name: `use${pascal(item.alias || '')}`,
          parameters: [
            {
              name: 'args?',
              // TODO: 处理函数
              type: `${argsType} | (() => ${argsType})`,
            },
            {
              name: 'opt',
              type: 'Options = {}',
            },
          ],
          statements,
        })
      }

      // 非别名的hooks
      methods.push({
        name: `use${pascal(gqlName)}`,
        parameters: [
          {
            name: 'args?',
            // TODO: 处理函数
            type: `${argsType} | (() => ${argsType})`,
          },
          {
            name: 'opt',
            type: 'Options = {}',
          },
        ],
        statements,
      })
    }
  }

  // import stook-graphql
  sourceFile.addImportDeclaration({
    moduleSpecifier: httpModule,
    namedImports: ['Options', 'useQuery', 'useMutate'],
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
    name: 'HooksService',
    methods,
  })

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'Hooks',
        initializer: `new HooksService()`,
      },
    ],
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
