import ts from 'typescript'

export const capitalize = (str: string): string => `${str.charAt(0).toUpperCase()}${str.slice(1)}`

export const createSourceFile = (filename: string) =>
  ts.createSourceFile(filename, '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
