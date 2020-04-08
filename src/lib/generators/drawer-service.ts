import {
  Project,
  VariableDeclarationKind,
  MethodDeclarationStructure,
  OptionalKind,
} from 'ts-morph'
import { last } from 'lodash'
import { join, sep } from 'path'
import { find } from 'fs-jetpack'
import saveSourceFile from '../utils/saveSourceFile'

export function generateDrawerService() {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', 'drawerService.tsx')
  const sourceFile = project.createSourceFile(outPath, undefined, { overwrite: true })

  sourceFile.addImportDeclaration({
    moduleSpecifier: '@peajs/drawer',
    namedImports: ['drawerStore'],
  })

  sourceFile.addVariableStatements([
    {
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'open',
          initializer: 'drawerStore.open',
        },
        {
          name: 'close',
          initializer: 'drawerStore.close',
        },
        {
          name: 'get',
          initializer: 'drawerStore.get',
        },
      ],
    },
  ])

  const dir = join(baseDirPath, 'src', 'drawers')
  const dirs = find(dir, { matching: '*.tsx' })
  const methods: OptionalKind<MethodDeclarationStructure>[] = []

  for (const item of dirs) {
    const drawerName = last(item.split(sep))?.replace('.tsx', '') as string

    methods.push({
      name: 'open' + drawerName,
      parameters: [{ name: 'data?', type: 'any' }],
      statements: `data ? open('${drawerName}', data) : open('${drawerName}')`,
    })

    methods.push({
      name: 'close' + drawerName,
      statements: `close('${drawerName}')`,
    })

    methods.push({
      name: 'get' + drawerName,
      statements: `return get('${drawerName}')`,
    })
  }

  sourceFile.addClass({
    name: 'DrawerService',
    methods,
  })

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'drawerService',
        initializer: `new DrawerService()`,
      },
    ],
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
