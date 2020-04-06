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

type Operation = 'Query' | 'Mutation'

export function generateHooks(
  httpModule: string,
  gqlConstantModule: string,
  hooksConfig: string[],
) {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', `hooks.ts`)
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

    // 只处理跟节点 Query、Mutation
    if (!['Query', 'Mutation'].includes(operation)) continue
    if (!objectType.fields || !objectType.fields.length) continue

    for (const field of objectType.fields) {
      let argsType: string
      let statements: string
      const queryName = field.name.value
      const isListType = get(field, 'type.type.kind') === 'ListType'
      const args = field.arguments || []
      let objectType: string = get(field, 'type.type.name.value')
      let T: string // 返回的类型

      // 如果 refetchConfig 配置大于 0，就只使用 refetchConfig 配置里面的 queryName
      if (hooksConfig.length && !hooksConfig.includes(queryName)) {
        continue
      }

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
      const action = operation === 'Query' ? 'useQuery' : 'useMutate'

      // 无参数
      if (!args.length) {
        argsType = 'any'
        statements = `return ${action}<${T}>(${gqlName}, { ...opt, variables: args||{} })`
        // 只有个参数并且叫 input
      } else if (args.length === 1 && firstArgName === 'input') {
        argsType = get(args[0], 'type.type.name.value')

        // TODO: 处理函数
        statements = `return ${action}<${T}>(${gqlName}, { ...opt, variables: { input: args||{} } })`
        // 多参数,或者不叫 input
      } else {
        argsType = `${capital(operation)}${pascal(gqlName)}Args`
        statements = `return ${action}<${T}>(${gqlName}, { ...opt, variables: args||{} })`
      }

      gqlNames.push(gqlName)
      if (argsType !== 'any') argTypes.push(argsType)

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
    namedImports: [...Array.from(new Set([...objectTypes, ...argTypes]))],
  })

  sourceFile.addImportDeclaration({
    moduleSpecifier: gqlConstantModule,
    namedImports: [...Array.from(new Set(gqlNames))],
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
