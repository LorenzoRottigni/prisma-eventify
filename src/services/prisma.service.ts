import { DMMF } from '@prisma/generator-helper'
import ts from 'typescript'

export class PrismaService {
  constructor(protected schema: DMMF.Document) {}

  protected get models(): Readonly<DMMF.Model[]> {
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
