import { PrismaService } from '../services/prisma.service'
import { ConfigService } from '../services/config.service'
import { EventConstituents, EventIdentifiers, EventifyGenerator, GeneratorHook, PrismaAPI } from '../types'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'
import { EventService } from '../services/event.service'

export class EventGenerator implements EventifyGenerator {
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private eventService = new EventService(),
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
  public generateEvent(
    { model, field, hook, method }: EventConstituents,
    eventName = `${model.toLowerCase()}${field ? `.${field}` : ''}${hook ? `.${hook}` : ''}${
      method ? `.${method}` : ''
    }`,
    exportName = `${capitalize(model)}${field ? capitalize(field) : ''}${hook ? capitalize(hook) : ''}${
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
            /* typeName */ ts.factory.createTypeReferenceNode(`typeof this.prisma.${model.toLowerCase()}.${method}`),
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
              /* typeName */ ts.factory.createTypeReferenceNode(`typeof this.prisma.${model.toLowerCase()}.${method}`),
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

  public generateConfigEntry(
    constituents: EventConstituents,
    { camelCase } = this.eventService.composeEventIdentifiers(constituents)
  ) {
    return ts.factory.createPropertyAssignment(
      ts.factory.createStringLiteral(camelCase),
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
                  `typeof prisma.${constituents.model.toLowerCase()}.${constituents.method}`
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
        constituents.hook === GeneratorHook.before
          ? ts.factory.createUnionTypeNode([
              ts.factory.createIndexedAccessTypeNode(
                /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
                  /* typeName */ ts.factory.createTypeReferenceNode(
                    `typeof prisma.${constituents.model.toLowerCase()}.${constituents.method}`
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
  }

  public generateConfigEntryType(
    constituents: EventConstituents,
    { camelCase } = this.eventService.composeEventIdentifiers(constituents)
  ) {
    return ts.factory.createPropertySignature(
      undefined,
      ts.factory.createStringLiteral(camelCase),
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
                    `typeof prisma.${constituents.model.toLowerCase()}.${constituents.method}`
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
                    this.prismaService.models
                      .map(({ fields, name: model }) =>
                        this.configService.modelAllowed(model)
                          ? [
                              /* Generates event names combining model, hook, method */
                              ...Object.values(PrismaAPI).map((method) =>
                                Object.values(GeneratorHook).map((hook) =>
                                  this.generateConfigEntry({
                                    model,
                                    hook,
                                    method,
                                  })
                                )
                              ),
                              /* Generates event names combining model, field, hook, method */
                              ...fields.map(({ name: field }) =>
                                this.configService.fieldAllowed(model, field)
                                  ? [PrismaAPI.create, PrismaAPI.delete, PrismaAPI.update].map((method) =>
                                      Object.values(GeneratorHook).map((hook) =>
                                        this.generateConfigEntry({ model, field, hook, method })
                                      )
                                    )
                                  : []
                              ),
                            ]
                          : []
                      )
                      .flat(4),
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
            this.prismaService.models
              .map(({ fields, name: model }) =>
                this.configService.modelAllowed(model)
                  ? [
                      /* Generates event names combining model, hook, method */
                      ...Object.values(PrismaAPI).map((method) =>
                        Object.values(GeneratorHook).map((hook) =>
                          this.generateConfigEntryType({
                            model,
                            hook,
                            method,
                          })
                        )
                      ),
                      /* Generates event names combining model, field, hook, method */
                      ...fields.map(({ name: field }) =>
                        this.configService.fieldAllowed(model, field)
                          ? [PrismaAPI.create, PrismaAPI.delete, PrismaAPI.update].map((method) =>
                              Object.values(GeneratorHook).map((hook) =>
                                this.generateConfigEntryType({ model, field, hook, method })
                              )
                            )
                          : []
                      ),
                    ]
                  : []
              )
              .flat(4)
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
            .map(({ fields, name: model }) =>
              this.configService.modelAllowed(model)
                ? [
                    /* Generates event names combining model, hook, method */
                    ...Object.values(PrismaAPI).map((method) =>
                      Object.values(GeneratorHook).map((hook) =>
                        this.generateEvent({
                          model,
                          hook,
                          method,
                        })
                      )
                    ),
                    /* Generates event names combining model, field, hook, method */
                    ...fields.map(({ name: field }) =>
                      this.configService.fieldAllowed(model, field)
                        ? [PrismaAPI.create, PrismaAPI.delete, PrismaAPI.update].map((method) =>
                            Object.values(GeneratorHook).map((hook) =>
                              this.generateEvent({ model, field, hook, method })
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
