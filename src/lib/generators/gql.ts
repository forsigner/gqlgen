import { Project, VariableDeclarationKind } from 'ts-morph'
import { join } from 'path'
import { upper } from 'case'
import { Source, buildSchema } from 'graphql'
import fs from 'fs'
import path from 'path'

import saveSourceFile from '../utils/saveSourceFile'
import { CommonConfig } from '../types'
import { generate } from '../gql-gen'

const schemaFilePath = path.join(process.cwd(), 'src', 'generated', 'schema.graphql')
const typeDef = fs.readFileSync(schemaFilePath, 'utf-8')
const source = new Source(typeDef)
const gqlSchema = buildSchema(source)

export async function generateGql(commonGql: CommonConfig, defaultDepthLimit: number) {
  const baseDirPath = process.cwd()
  const outPath = join(process.cwd(), 'src', 'generated', 'gql.ts')
  const project = new Project()

  const sourceFile = project.createSourceFile(outPath, undefined, {
    overwrite: true,
  })

  const fields = [
    ...Object.keys(gqlSchema.getQueryType()?.getFields() || {}),
    ...Object.keys(gqlSchema.getMutationType()?.getFields() || {}),
    ...Object.keys(gqlSchema.getSubscriptionType()?.getFields() || {}),
  ]

  const allConfig: CommonConfig = fields.map((field) => {
    const find = commonGql.find((i) => i.name === field)
    if (find) return find
    return {
      name: field,
      depthLimit: defaultDepthLimit,
    }
  })

  const data = generate(allConfig)

  // import gql-tag
  sourceFile.addImportDeclaration({
    moduleSpecifier: 'gql-tag',
    defaultImport: 'gql',
  })

  for (const item of data) {
    sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: upper(item.name, '_'),
          initializer: 'gql' + '`' + '\n' + item.query + '\n' + '`',
        },
      ],
      isExported: true,
    })
  }

  await saveSourceFile(sourceFile)
}
