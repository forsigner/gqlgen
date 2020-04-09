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

export function generateApi(httpModule: string, gqlConstantModule: string, apiConfig: string[]) {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', `api.ts`)
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

    // 只处理跟节点 Mutation
    // if (operation !== 'Mutation') continue
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
      if (apiConfig.length && !apiConfig.includes(queryName)) {
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

      // 无参数
      if (!args.length) {
        argsType = 'any'
        statements = `return await query<${T}>(${gqlName}, { ...opt, variables: args })`
        // 只有个参数并且叫 input
      } else if (args.length === 1 && firstArgName === 'input') {
        argsType = get(args[0], 'type.type.name.value')
        statements = `return await query<${T}>(${gqlName}, { ...opt, variables: { input: args } })`
        // 多参数,或者不叫 input
      } else {
        argsType = `${capital(operation)}${pascal(gqlName)}Args`
        statements = `return await query<${T}>(${gqlName}, { ...opt, variables: args })`
      }

      gqlNames.push(gqlName)
      if (argsType !== 'any') argTypes.push(argsType)

      methods.push({
        name: queryName,
        isAsync: true,
        parameters: [
          {
            name: 'args',
            type: `${argsType} = {} as ${argsType}`,
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
    namedImports: ['Options', 'query'],
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
    name: 'ApiService',
    methods,
  })

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'Api',
        initializer: `new ApiService()`,
      },
    ],
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
