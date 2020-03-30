import { Project, VariableDeclarationKind } from 'ts-morph'
import { join } from 'path'
import { upper } from 'case'

import saveSourceFile from '../utils/saveSourceFile'
import { generate } from '../gql-gen/index'
import { CustomGqlConfig } from '../types'

function genGQL(outPath: string, data: any) {
  const project = new Project()
  const sourceFile = project.createSourceFile(outPath, undefined, {
    overwrite: true,
  })

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

  saveSourceFile(sourceFile)
}

export function generateCustomGql(config: CustomGqlConfig) {
  if (!config || !config.length) return
  const data = generate(config)
  const outPath = join(process.cwd(), 'src', 'generated', 'custom-gql.ts')
  genGQL(outPath, data)
}
