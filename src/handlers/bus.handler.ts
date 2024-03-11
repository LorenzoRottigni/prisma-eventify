import { EventBus } from 'ts-bus'
import * as events from '../../codegen/events'
import { createSourceFile } from '../utils'
import fs from 'fs'
import ts from 'typescript'
import { ConfigService } from '../services/config.service'
import { PrismaService } from '../services/prisma.service'

export class BusHandler {
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private bus = new EventBus(),
    private sourceFiles = [createSourceFile('config.events.ts'), createSourceFile('config.events.d.ts')]
  ) {}

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

  public generateBundle(): boolean {
    return ![this.generateEventsConfigurationTypes(), this.generateEventsConfiguration()].includes(false)
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

  public generateEventsConfiguration(): boolean {
    try {
      // if (fs.existsSync(this.sourceFiles[0].fileName)) return true
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

      console.log(
        Object.values(events)
          .map((e) => e.toString())
          .join('; ')
      )

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
                      const { model, method } = this.destructureEventName(event.toString())
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
                          undefined,
                          undefined,
                          ts.factory.createBlock([])
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
}
