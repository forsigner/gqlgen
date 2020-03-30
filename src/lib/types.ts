export interface ServiceOptions {
  name: string;
  baseDirPath?: string;
  outPath?: string;
}

export type CustomGqlConfig = ConfigItem[];
export interface ConfigItem {
  name: string;
  depthLimit?: number;
}

export type GraphQLData = Array<{
  name: string;
  query: string;
}>;

export interface GenerateQueryParams {
  curName: string;
  curParentType: string;
  curParentName?: string;
  argumentsDict?: { [key: string]: any };
  duplicateArgCounts?: { [key: string]: any };
  crossReferenceKeyList?: string[]; // [`${curParentName}To${curName}Key`]
  curDepth?: number;
  depthLimit?: number;
}
