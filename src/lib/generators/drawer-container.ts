import { Project, VariableDeclarationKind } from 'ts-morph'
import { join, sep } from 'path'
import { last } from 'lodash'
import { find } from 'fs-jetpack'
import saveSourceFile from '../utils/saveSourceFile'

export function generateDrawerContainer() {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', `DrawerContainer.tsx`)
  const sourceFile = project.createSourceFile(outPath, undefined, { overwrite: true })
  const dir = join(baseDirPath, 'src', 'drawers')
  const dirs = find(dir, { matching: '*.tsx' })

  sourceFile.addImportDeclarations([
    {
      moduleSpecifier: 'react',
      defaultImport: 'React',
    },
    {
      moduleSpecifier: '@peajs/drawer',
      namedImports: ['Drawers', 'DrawerConfig'],
    },
  ])

  let configString = ''
  for (const item of dirs) {
    const drawerName = last(item.split(sep))?.replace('.tsx', '')

    configString += `{
      name: '${drawerName}',
      component: ${drawerName},
    },`

    // import Drawer Component
    sourceFile.addImportDeclaration({
      moduleSpecifier: `@drawers/${drawerName}`,
      defaultImport: drawerName,
    })
  }

  const configInitializer = `[${configString}]`

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'config',
        type: 'DrawerConfig',
        initializer: configInitializer,
      },
    ],
    isExported: true,
  })

  // 组件
  sourceFile.addFunction({
    name: 'DrawerContainer',
    statements: `
      return (
          <Drawers config={config}></Drawers>
      )
    `,
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
