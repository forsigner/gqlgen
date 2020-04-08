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

export function generateModalService() {
  const project = new Project()
  const baseDirPath = process.cwd()
  const outPath = join(baseDirPath, 'src', 'generated', 'modalService.tsx')
  const sourceFile = project.createSourceFile(outPath, undefined, { overwrite: true })

  sourceFile.addImportDeclaration({
    moduleSpecifier: '@common/modal',
    namedImports: ['modalStore'],
  })

  sourceFile.addVariableStatements([
    {
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'open',
          initializer: 'modalStore.open',
        },
        {
          name: 'close',
          initializer: 'modalStore.close',
        },
      ],
    },
  ])

  const dir = join(baseDirPath, 'src', 'modals')
  const dirs = find(dir, { matching: '*.tsx' })
  const methods: OptionalKind<MethodDeclarationStructure>[] = []

  for (const item of dirs) {
    const modalName = last(item.split(sep))?.replace('.tsx', '') as string

    methods.push({
      name: 'open' + modalName,
      parameters: [{ name: 'data?', type: 'any' }],
      statements: `data ? open('${modalName}', data) : open('${modalName}')`,
    })

    methods.push({
      name: 'close' + modalName,
      statements: `close('${modalName}')`,
    })
  }

  sourceFile.addClass({
    name: 'ModalService',
    methods,
  })

  sourceFile.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: 'modalService',
        initializer: `new ModalService()`,
      },
    ],
    isExported: true,
  })

  saveSourceFile(sourceFile)
}
