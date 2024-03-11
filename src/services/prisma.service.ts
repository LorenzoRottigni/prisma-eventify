import { DMMF } from '@prisma/generator-helper'
import ts from 'typescript'
import { capitalize } from '../utils'

export class PrismaService {
  constructor(public schema: DMMF.Document) {}

  public get models(): Readonly<DMMF.Model[]> {
    return this.schema.datamodel.models
  }

  public getModel(model: string): Readonly<DMMF.Model> | null {
    return this.models.find((m) => m.name.toLowerCase() === model.toLowerCase()) || null
  }

  public getModelFields(model: string): Readonly<DMMF.Field[]> {
    return this.getModel(model)?.fields || []
  }

  public getModelField(model: string, field: string): Readonly<DMMF.Field> | null {
    return this.getModelFields(model).find((f) => f.name.toLowerCase() === field.toLowerCase()) || null
  }

  /**
   * @description Get import declaration for one or more Prisma model, by default all models will be included.
   * @param {string[]} models Prisma models to included in the import declaration.
   * @returns {ts.ImportDeclaration}
   */
  public generatePrismaClientModelsImport(models: string[] = this.models.map((m) => m.name)): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        true,
        undefined,
        ts.factory.createNamedImports(
          models.map((model) =>
            ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(capitalize(model)))
          )
        )
      ),
      ts.factory.createStringLiteral('@prisma/client')
    )
  }

  /**
   * @description Generates Prisma client import declaration:
   * import { PrismaClient } from '@prisma/client'
   * @returns {ts.ImportDeclaration}
   */
  public prismaClientImport(typeOnly = false): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      /* modifiers */ undefined,
      ts.factory.createImportClause(
        /* isTypeOnly */ typeOnly,
        /* name (default import) */ undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('PrismaClient')),
        ])
      ),
      ts.factory.createStringLiteral('@prisma/client')
    )
  }

  /**
   * @description Converts a Prisma raw DB type to a known Typescript type.
   * @param {string} type Prisma raw DB type
   * @returns {ts.TypeNode}
   */
  public prismaToTSType(type: string): ts.TypeNode {
    switch (type) {
      case 'Int':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
      case 'String':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      case 'Boolean':
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword)
      case 'DateTime':
        return ts.factory.createTypeReferenceNode('Date', [])
      default:
        return ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
    }
  }
}
