import ts from 'typescript'
import { Prisma } from '@prisma/client'

export declare type EventifySourceFile = ts.SourceFile & { model: string }

export declare interface EventifyGenerator {
  generateBundle(): boolean
}

export enum PrismaAPI {
  findMany = 'findMany',
  findUnique = 'findUnique',
  create = 'create',
  update = 'update',
  delete = 'delete',
}

export enum GeneratorHook {
  before = 'before',
  after = 'after',
}

export declare interface EventIdentifiers {
  camelCase: string
  dotCase: string
}

export declare interface EventConstituents {
  model: string
  field?: string
  hook?: GeneratorHook
  method?: PrismaAPI
}
