export interface ServiceOptions {
  name: string
  baseDirPath?: string
  outPath?: string
}

export type CustomGqlConfig = ConfigItem[]
export type CommonConfig = ConfigItem[]
export interface ConfigItem {
  alias?: string // 生成的变量的名称，比如 SCRIPT
  name: string // graphql 端点名称
  depthLimit?: number // 深度
  excludes?: string[] // 忽略的字段
}

export type GraphQLData = Array<{
  name: string
  query: string
}>

export interface GenerateQueryParams {
  curName: string
  curParentType: string
  curParentName?: string
  argumentsDict?: { [key: string]: any }
  duplicateArgCounts?: { [key: string]: any }
  crossReferenceKeyList?: string[] // [`${curParentName}To${curName}Key`]
  curDepth?: number
  depthLimit?: number
  excludes?: string[] // 忽略的字段
}
