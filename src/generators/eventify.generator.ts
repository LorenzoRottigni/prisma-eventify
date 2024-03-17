import { PrismaService } from '../services/prisma.service'
import { ConfigService } from '../services/config.service'
import { EventConstituents, EventifyFile, EventifyGenerator, GeneratorHook, PrismaAPI } from '../types'
import ts from 'typescript'
import fs from 'fs'
import path from 'path'
import { capitalize, createSourceFile } from '../utils'
import { EventService } from '../services/eventify.service'

/**
 * @description ** EventifyGenerator **
 * Generator class to generate a typescript AST-syntax bundle for event bus handlure.
 */
export class EventGenerator implements EventifyGenerator {
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private eventService = new EventService(),
    private sourceFiles: ts.SourceFile[] = [
      createSourceFile(EventifyFile.events),
      createSourceFile(EventifyFile.config),
      createSourceFile(EventifyFile.configTypes),
    ]
  ) {}

  /**
   * @description Generates import from ts-bus:
   * import { createEventDefinition } from "ts-bus";
   * @returns {ts.ImportDeclaration}
   */
  private get createEventDefinitionImport(): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      /* modifiers */ undefined,
      /* clause */ ts.factory.createImportClause(
        /* typeOnly */ false,
        /* name */ undefined,
        /* namedBindings */ ts.factory.createNamedImports(
          /* elements */ [
            ts.factory.createImportSpecifier(
              /* typeOnly */ false,
              /* propertyName */ undefined,
              /*name*/ ts.factory.createIdentifier('createEventDefinition')
            ),
          ]
        )
      ),
      /* moduleSpecifier */ ts.factory.createStringLiteral('ts-bus')
    )
  }

  /**
   * @description Generates an event declaration:
   * export const <Model><Field><Hook><Method> = createEventDefinition<{
   *     args: Parameters<PrismaClient['<model>']['<method>']>[0];
   *     ctx: unknown;
   *     prisma: PrismaClient;
   * }>()("<model>.<method>.<hook>.<method>");
   * @param {EventConstituents} _ chunks composing the event name.
   * @param eventName dot.case event name
   * @param exportName camelCase event name
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
    const typeArgs: ts.TypeElement[] = [
      ts.factory.createPropertySignature(
        /* modifiers */ undefined,
        /* name */ ts.factory.createIdentifier('args'),
        /* questionToken */ undefined,
        /* type */ ts.factory.createIndexedAccessTypeNode(
          /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
            /* typeName */ ts.factory.createTypeReferenceNode(`PrismaClient['${model.toLowerCase()}']['${method}']`),
          ]),
          /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
        )
      ),
      ts.factory.createPropertySignature(
        /* modifiers */ undefined,
        /* name */ ts.factory.createIdentifier('ctx'),
        /* questionToken */ undefined,
        /* type */ ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      ),
      ts.factory.createPropertySignature(
        /* modifiers */ undefined,
        /* name */ ts.factory.createIdentifier('prisma'),
        /* questionToken */ undefined,
        /* type */ ts.factory.createTypeReferenceNode('PrismaClient')
      ),
    ]

    if (hook === GeneratorHook.after)
      typeArgs.push(
        ts.factory.createPropertySignature(
          /* modifiers */ undefined,
          /* name */ ts.factory.createIdentifier('result'),
          /* questionToken */ undefined,
          /* type */ ts.factory.createTypeReferenceNode('Promise', [
            ts.factory.createTypeReferenceNode('ReturnType', [
              /* typeName */ ts.factory.createTypeReferenceNode(`PrismaClient['${model.toLowerCase()}']['${method}']`),
            ]),
          ])
        )
      )

    return ts.factory.createVariableStatement(
      /* modifiers */ [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      /* declarationList */ ts.factory.createVariableDeclarationList(
        /* declarations */ [
          ts.factory.createVariableDeclaration(
            /* name */ ts.factory.createIdentifier(exportName),
            /* exclamationToken */ undefined,
            /* type */ undefined,
            /* initializer */ ts.factory.createCallExpression(
              /* expression */ ts.factory.createCallExpression(
                /* expression */ ts.factory.createIdentifier('createEventDefinition'),
                /* typeArgs */ [ts.factory.createTypeLiteralNode(typeArgs)],
                /* args */ []
              ),
              /* typeArgs */ undefined,
              /* args */ [ts.factory.createStringLiteral(eventName)]
            )
          ),
        ],
        /* flags */ ts.NodeFlags.Const
      )
    )
  }

  /**
   * @description Generates an eventify.config.ts event entry:
   * <Model><Field><Hook><Method>: (
   *   args: Parameters<typeof prisma.<model>.<method>[0],
   *   ctx: unknown,
   *   prisma: PrismaClient
   * ): Parameters<typeof prisma.<model>.<method>>[0] | void => {
   *   console.log('Dispatched event: <Model><Field><Hook><Method>')
   * },
   * @param {EventConstituents} constituents chunks composing the event name.
   * @returns {ts.PropertyAssignment}
   */
  public generateConfigEntry(
    constituents: EventConstituents,
    { camelCase } = this.eventService.composeEventIdentifiers(constituents)
  ): ts.PropertyAssignment {
    return ts.factory.createPropertyAssignment(
      /* name */ ts.factory.createStringLiteral(camelCase),
      /* initializer */ ts.factory.createArrowFunction(
        /* modifiers */ undefined,
        /* typeParams */ undefined,
        /* params */ [
          /* param */ ts.factory.createParameterDeclaration(
            /* modifiers */ undefined,
            /* dotDotToken */ undefined,
            /* name */ 'args',
            /* questionToken */ undefined,
            /* type */ ts.factory.createIndexedAccessTypeNode(
              /* objectType */ ts.factory.createTypeReferenceNode(
                'Parameters',
                /* typeArgs */ [
                  ts.factory.createTypeReferenceNode(
                    /* typeName */ `typeof prisma.${constituents.model.toLowerCase()}.${constituents.method}`
                  ),
                ]
              ),
              /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
            )
          ),
          /* param*/ ts.factory.createParameterDeclaration(
            /* modifiers */ undefined,
            /* dotDotToken */ undefined,
            /* name */ 'ctx',
            /* questionToken */ undefined,
            /* type*/ ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
          ),
          /* param */ ts.factory.createParameterDeclaration(
            /* modifiers */ undefined,
            /* dotDotToken */ undefined,
            /* name */ 'prisma',
            /* questionToken */ undefined,
            /* type*/ ts.factory.createTypeReferenceNode('PrismaClient')
          ),
        ],
        /* type */ constituents.hook === GeneratorHook.before
          ? ts.factory.createUnionTypeNode(
              /* types*/ [
                /* unionType */ ts.factory.createIndexedAccessTypeNode(
                  /* objectType */ ts.factory.createTypeReferenceNode(
                    /* typeName */ 'Parameters',
                    /* typeArgs */ [
                      ts.factory.createTypeReferenceNode(
                        `typeof prisma.${constituents.model.toLowerCase()}.${constituents.method}`
                      ),
                    ]
                  ),
                  /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
                ),
                /* unionType */ ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
              ]
            )
          : ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        /* equalsGreaterThanToken */ undefined,
        /* body */ ts.factory.createBlock([
          /* statement*/ ts.factory.createExpressionStatement(
            /* expression */ ts.factory.createCallExpression(
              /* expression */ ts.factory.createPropertyAccessExpression(
                /* expression*/ ts.factory.createIdentifier('console'),
                /* name */ ts.factory.createIdentifier('log')
              ),
              /* typeArgs */ undefined,
              /* args */ [ts.factory.createStringLiteral(`Dispatched event: ${camelCase}`)]
            )
          ),
        ])
      )
    )
  }

  /**
   * @description Generated types declarations for an eventify.config.ts event entry:
   * <Model><Field><Hook><Method>:
   *  | undefined
   *  | ((args: Parameters<typeof prisma.<model>.<hook>[0], ctx: unknown, prisma: PrismaClient) => void)
   * @param {EventConstituents} constituents chunks composing the event name.
   * @returns { ts.PropertyAssignment }
   */
  public generateConfigEntryType(
    constituents: EventConstituents,
    { camelCase } = this.eventService.composeEventIdentifiers(constituents)
  ) {
    return ts.factory.createPropertySignature(
      /* modifirs */ undefined,
      /* name */ ts.factory.createStringLiteral(camelCase),
      /* questionToken */ undefined,
      /* type */ ts.factory.createUnionTypeNode(
        /* types*/ [
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.UndefinedKeyword),
          ts.factory.createFunctionTypeNode(
            /* typeParams */ [],
            /* prams */ [
              ts.factory.createParameterDeclaration(
                /* modifiers */ undefined,
                /* dotDotToken*/ undefined,
                /* name */ 'args',
                /* questionToken */ undefined,
                /* type */ ts.factory.createIndexedAccessTypeNode(
                  /* objectType */ ts.factory.createTypeReferenceNode(
                    /* typeName */ 'Parameters',
                    /* typeArgs */ [
                      ts.factory.createTypeReferenceNode(
                        /* typeName */ `typeof prisma.${constituents.model.toLowerCase()}.${constituents.method}`
                      ),
                    ]
                  ),
                  /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
                )
              ),
              ts.factory.createParameterDeclaration(
                /* modifiers */ undefined,
                /* dotDotToken*/ undefined,
                /* name */ 'ctx',
                /* questionToken */ undefined,
                /* type */ ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
              ),
              ts.factory.createParameterDeclaration(
                /* modifiers */ undefined,
                /* dotDotToken*/ undefined,
                /* name */ 'prisma',
                /* questionToken */ undefined,
                /* type */ ts.factory.createTypeReferenceNode('PrismaClient')
              ),
            ],
            ts.factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword)
          ),
        ]
      )
    )
  }

  /**
   * @description Generates EventsConfig import declaration:
   * import type { EventsConfig } from './eventify/types/eventify.config.d.ts'
   * @returns {ts.ImportDeclaration}
   */
  private async getEventsConfigImport(): Promise<ts.ImportDeclaration> {
    return ts.factory.createImportDeclaration(
      /* modifiers */ undefined,
      /* clause */ ts.factory.createImportClause(
        /* isTypeOnly */ true,
        /* name (default import) */ undefined,
        /* bindings */ ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('EventsConfig')),
        ])
      ),
      /* moduleSpecifier */ ts.factory.createStringLiteral(
        await this.configService.buildPath('eventify.config.d.ts', '/types')
      )
    )
  }

  /**
   * @description Generates events configuration eventify.config.ts:
   * import type { EventsConfig } from './eventify/types/eventify.config.d.ts'
   * import type { PrismaClient } from '@prisma/client'
   * export const config: EventsConfig = {
   *  ...eventConfigEntries
   * }
   * @param {ts.SourceFile} sourceFile
   * @returns {Promise<boolean>}
   */
  public async generateEventsConfiguration(sourceFile: ts.SourceFile): Promise<boolean> {
    try {
      if (fs.existsSync(path.relative(process.cwd(), sourceFile.fileName))) return true
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const _path = path.relative(process.cwd(), sourceFile.fileName)

      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(sourceFile, [
          /* statement */ await this.getEventsConfigImport(),
          /* statement */ this.prismaService.prismaClientImport(true),
          /* statement */ ts.factory.createVariableStatement(
            /* modifiers */ [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            /* declarationList */ ts.factory.createVariableDeclarationList(
              /* declarations */ [
                ts.factory.createVariableDeclaration(
                  /* name */ ts.factory.createIdentifier('config'),
                  /* exclamationToken */ undefined,
                  /* type */ ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('EventsConfig')),
                  /* initializer */ ts.factory.createObjectLiteralExpression(
                    /* properties */ this.prismaService.models
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
                    /* multiline */ true
                  )
                ),
              ],
              /* flags */ ts.NodeFlags.Const
            )
          ),
          /* statement */ ts.factory.createExportDefault(/* expression */ ts.factory.createIdentifier('config')),
        ]),
        sourceFile
      )

      try {
        fs.accessSync(process.cwd())
      } catch (err) {
        console.error(err)
        throw new Error(`Service bundle generation denied for ${path}`)
      }

      await fs.promises.writeFile(_path, file, { flag: 'w' })
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  /**
   * @description Generate types declarations for events configuration eventify.config.ts:
   * import type { PrismaClient } from '@prisma/client'
   * export interface EventsConfig {
   *    ...eventConfigEntryTypes
   * }
   * @param {ts.SourceFile} sourceFile
   * @returns {Promise<boolean>}
   */
  public async generateEventsConfigurationTypes(sourceFile: ts.SourceFile): Promise<boolean> {
    try {
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const path = await this.configService.buildPath(sourceFile.fileName, '/types')

      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(sourceFile, [
          this.prismaService.prismaClientImport(true),
          ts.factory.createInterfaceDeclaration(
            /* modifiers */ [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            /* name */ ts.factory.createIdentifier('EventsConfig'),
            /* typeParams */ undefined,
            /* heritageClauses */ undefined,
            /* members */ this.prismaService.models
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
        sourceFile
      )

      try {
        fs.accessSync(await this.configService.buildPath(undefined, '/types'))
      } catch (err) {
        console.error(err)
        throw new Error(`Service bundle generation denied for ${path}`)
      }

      await fs.promises.writeFile(path, file, {
        flag: 'w',
      })
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  /**
   * @description Generates events bundle events.ts.
   * @returns {boolean} Generation status.
   */
  public async generateEventsBundle(sourceFile: ts.SourceFile): Promise<boolean> {
    try {
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const path = await this.configService.buildPath(sourceFile.fileName)

      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(sourceFile, [
          this.createEventDefinitionImport,
          this.prismaService.prismaClientImport(true),
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
        sourceFile
      )

      try {
        fs.accessSync(await this.configService.buildPath())
      } catch (err) {
        console.error(err)
        throw new Error(`Service bundle generation denied for ${path}`)
      }

      await fs.promises.writeFile(path, file, { flag: 'w' })
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  /**
   * @description Generate Eventify bundle.
   * @returns {Promise<boolean>} generation status.
   */
  public async generateBundle(): Promise<boolean> {
    return !(
      await Promise.all([
        this.generateEventsBundle(this.sourceFiles[0]),
        this.generateEventsConfiguration(this.sourceFiles[1]),
        this.generateEventsConfigurationTypes(this.sourceFiles[2]),
      ])
    ).includes(false)
  }
}
