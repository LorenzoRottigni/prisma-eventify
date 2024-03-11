import { PrismaService } from '../services/prisma.service'
import { ConfigService } from '../services/config.service'
import { EventifyGenerator, GeneratorHook, PrismaAPI } from '../types'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'

export class EventGenerator implements EventifyGenerator {
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private sourceFile: ts.SourceFile = createSourceFile('events.ts')
  ) {}

  /**
   * @description Generates import from ts-bus:
   * import { createEventDefinition } from "ts-bus";
   * @returns {ts.ImportDeclaration}
   */
  private get createEventDefinitionImport(): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('createEventDefinition')),
        ])
      ),
      ts.factory.createStringLiteral('ts-bus')
    )
  }

  /**
   * @description Generates an event definition for the event bus:
   * <modelName>.<fieldName>.<hook>.<method>
   * @param {string} modelName
   * @param {string} fieldName
   * @param {GeneratorHook} hook
   * @param {PrismaAPI} method
   * @param {string} eventName
   * @param {string} exportName
   * @returns {ts.VariableStatement}
   */
  public generateEventDefinition(
    modelName: string,
    fieldName: string | undefined,
    hook: GeneratorHook | undefined,
    method: PrismaAPI | undefined,
    eventName = `${modelName.toLowerCase()}${fieldName ? `.${fieldName}` : ''}${hook ? `.${hook}` : ''}${
      method ? `.${method}` : ''
    }`,
    exportName = `${capitalize(modelName)}${fieldName ? capitalize(fieldName) : ''}${hook ? capitalize(hook) : ''}${
      method ? capitalize(method) : ''
    }`
  ): ts.VariableStatement {
    const args = [
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier('args'),
        undefined,
        /* type */ ts.factory.createIndexedAccessTypeNode(
          /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
            /* typeName */ ts.factory.createTypeReferenceNode(
              `typeof this.prisma.${modelName.toLowerCase()}.${method}`
            ),
          ]),
          /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
        )
      ),
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier('ctx'),
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      ),
      ts.factory.createPropertySignature(
        undefined,
        ts.factory.createIdentifier('prisma'),
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      ),
    ]

    if (hook === GeneratorHook.after)
      args.push(
        ts.factory.createPropertySignature(
          undefined,
          ts.factory.createIdentifier('result'),
          undefined,
          /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
            ts.factory.createTypeReferenceNode('ReturnType', [
              /* typeName */ ts.factory.createTypeReferenceNode(
                `typeof this.prisma.${modelName.toLowerCase()}.${method}`
              ),
            ]),
          ])
        )
      )

    return ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            ts.factory.createIdentifier(exportName),
            undefined,
            undefined,
            ts.factory.createCallExpression(
              ts.factory.createCallExpression(
                ts.factory.createIdentifier('createEventDefinition'),
                [ts.factory.createTypeLiteralNode(args)],
                []
              ),
              undefined,
              [ts.factory.createStringLiteral(eventName)]
            )
          ),
        ],
        ts.NodeFlags.Const
      )
    )
  }

  /**
   * @description Generates events bundle.
   * @returns {boolean} Generation status.
   */
  public generateBundle(): boolean {
    try {
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const filename = this.configService.buildPath(this.sourceFile.fileName)
      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(this.sourceFile, [
          this.createEventDefinitionImport,
          ...this.prismaService.models
            .map(({ fields, name: modelName }) =>
              this.configService.modelAllowed(modelName)
                ? [
                    /* Generates event names combining model, hook, method */
                    ...Object.values(PrismaAPI).map((method) =>
                      Object.values(GeneratorHook).map((hook) =>
                        this.generateEventDefinition(modelName, undefined, hook, method)
                      )
                    ),
                    /* Generates event names combining model, field, hook, method */
                    ...fields.map(({ name: fieldName }) =>
                      this.configService.fieldAllowed(modelName, fieldName)
                        ? [PrismaAPI.create, PrismaAPI.delete, PrismaAPI.update].map((method) =>
                            Object.values(GeneratorHook).map((hook) =>
                              this.generateEventDefinition(modelName, fieldName, hook, method)
                            )
                          )
                        : []
                    ),
                  ]
                : []
            )
            .flat(4),
        ]),
        this.sourceFile
      )
      fs.writeFileSync(filename, file)
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }
}
