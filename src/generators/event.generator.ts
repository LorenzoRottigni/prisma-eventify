import { PrismaService } from '../services/prisma.service'
import { ConfigService } from '../services/config.service'
import { EventifyGenerator, GeneratorHook, PrismaAPI } from '../types'
import * as events from './../../codegen/events'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'

export class EventGenerator implements EventifyGenerator {
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private sourceFiles: ts.SourceFile[] = [
      createSourceFile('events.ts'),
      createSourceFile('config.events.ts'),
      createSourceFile('config.events.d.ts'),
    ]
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

  private destructureEventName(event: string): { model: string; field?: string; hook?: string; method?: string } {
    const chunks = event.split('.')
    return chunks.length <= 3
      ? {
          model: chunks[0],
          hook: chunks?.[1],
          method: chunks?.[2],
        }
      : {
          model: chunks[0],
          field: chunks?.[1],
          hook: chunks?.[2],
          method: chunks?.[3],
        }
  }

  private get eventTypeImport(): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      /* modifiers */ undefined,
      ts.factory.createImportClause(
        /* isTypeOnly */ true,
        /* name (default import) */ undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('EventsConfig')),
        ])
      ),
      ts.factory.createStringLiteral(this.configService.buildPath('config.events.d.ts'))
    )
  }

  public generateEventsConfiguration(): boolean {
    try {
      // if (fs.existsSync(this.sourceFiles[0].fileName)) return true
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(this.sourceFiles[0], [
          this.eventTypeImport,
          this.prismaService.prismaClientImport(true),
          ts.factory.createVariableStatement(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier('config'),
                  undefined,
                  ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('EventsConfig')),
                  ts.factory.createObjectLiteralExpression(
                    Object.entries(events).map(([eventName, event]) => {
                      const { model, method, hook } = this.destructureEventName(event.toString())
                      return ts.factory.createPropertyAssignment(
                        ts.factory.createStringLiteral(eventName),
                        ts.factory.createArrowFunction(
                          undefined,
                          undefined,
                          [
                            ts.factory.createParameterDeclaration(
                              undefined,
                              undefined,
                              'args',
                              undefined,
                              ts.factory.createIndexedAccessTypeNode(
                                /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
                                  /* typeName */ ts.factory.createTypeReferenceNode(
                                    `typeof prisma.${model.toLowerCase()}.${method}`
                                  ),
                                ]),
                                /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
                              )
                            ),
                            ts.factory.createParameterDeclaration(
                              undefined,
                              undefined,
                              'ctx',
                              undefined,
                              ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
                            ),
                            ts.factory.createParameterDeclaration(
                              undefined,
                              undefined,
                              'prisma',
                              undefined,
                              ts.factory.createTypeReferenceNode('PrismaClient')
                            ),
                          ],
                          hook === GeneratorHook.before
                            ? ts.factory.createUnionTypeNode([
                                ts.factory.createIndexedAccessTypeNode(
                                  /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
                                    /* typeName */ ts.factory.createTypeReferenceNode(
                                      `typeof prisma.${model.toLowerCase()}.${method}`
                                    ),
                                  ]),
                                  /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
                                ),
                                ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
                              ])
                            : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
                          undefined,
                          ts.factory.createBlock([ts.factory.createReturnStatement()])
                        )
                      )
                    }),
                    true
                  )
                ),
              ],
              ts.NodeFlags.Const
            )
          ),
          ts.factory.createExportDefault(ts.factory.createIdentifier('config')),
        ]),
        this.sourceFiles[0]
      )

      fs.writeFileSync(this.sourceFiles[0].fileName, file)
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  public generateEventsConfigurationTypes(): boolean {
    try {
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(this.sourceFiles[1], [
          this.prismaService.prismaClientImport(true),
          ts.factory.createInterfaceDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createIdentifier('EventsConfig'),
            undefined,
            undefined,
            Object.entries(events).map(([eventName, event]) => {
              const { model, method } = this.destructureEventName(event.toString())
              return ts.factory.createPropertySignature(
                undefined,
                ts.factory.createStringLiteral(eventName),
                undefined,
                ts.factory.createUnionTypeNode([
                  ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
                  ts.factory.createFunctionTypeNode(
                    [],
                    [
                      ts.factory.createParameterDeclaration(
                        undefined,
                        undefined,
                        'args',
                        undefined,
                        ts.factory.createIndexedAccessTypeNode(
                          /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
                            /* typeName */ ts.factory.createTypeReferenceNode(
                              `typeof prisma.${model.toLowerCase()}.${method}`
                            ),
                          ]),
                          /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
                        )
                      ),
                      ts.factory.createParameterDeclaration(
                        undefined,
                        undefined,
                        'ctx',
                        undefined,
                        ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
                      ),
                      ts.factory.createParameterDeclaration(
                        undefined,
                        undefined,
                        'prisma',
                        undefined,
                        ts.factory.createTypeReferenceNode('PrismaClient')
                      ),
                    ],
                    ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword) // Return type is void
                  ),
                ])
              )
            })
          ),
        ]),
        this.sourceFiles[1]
      )

      fs.writeFileSync(this.configService.buildPath(this.sourceFiles[1].fileName), file)
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  /**
   * @description Generates events bundle.
   * @returns {boolean} Generation status.
   */
  public generateEventsBundle(): boolean {
    try {
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const filename = this.configService.buildPath(this.sourceFiles[0].fileName)
      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(this.sourceFiles[0], [
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
        this.sourceFiles[0]
      )
      fs.writeFileSync(filename, file)
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  public generateBundle(): boolean {
    return ![this.generateEventsBundle()].includes(false)
  }
}
