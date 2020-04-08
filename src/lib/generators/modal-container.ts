import { Project, VariableDeclarationKind } from 'ts-morph'
import { join, sep } from 'path'
import { last } from 'lodash'
import { find } from 'fs-jetpack'
import saveSourceFile from '../utils/saveSourceFile'

export function generateModalContainer() {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', `ModalContainer.tsx`)
  const sourceFile = project.createSourceFile(outPath, undefined, { overwrite: true })
  const dir = join(baseDirPath, 'src', 'modals')
  const dirs = find(dir, { matching: '*.tsx' })

  sourceFile.addImportDeclarations([
    {
      moduleSpecifier: 'react',
      defaultImport: 'React',
    },
    {
      moduleSpecifier: 'react-native',
      namedImports: ['View'],
    },
    {
      moduleSpecifier: '@common/modal',
      namedImports: [' Modals', 'ModalConfig'],
    },
  ])

  let configString = ''
  for (const item of dirs) {
    const modalName = last(item.split(sep))?.replace('.tsx', '')

    configString += `{
      name: '${modalName}',
      component: ${modalName},
    },`

    // import Modal Component
    sourceFile.addImportDeclaration({
      moduleSpecifier: `@modals/${modalName}`,
      defaultImport: modalName,
    })
  }

  const configInitializer = `[${configString}]`

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'config',
        type: 'ModalConfig',
        initializer: configInitializer,
      },
    ],
    isExported: true,
  })

  // 组件
  sourceFile.addFunction({
    name: 'ModalContainer',
    statements: `
      return (
        <View>
          <Modals config={config}></Modals>
        </View>
      )
    `,
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
