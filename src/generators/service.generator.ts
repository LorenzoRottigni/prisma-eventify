import { PrismaService } from '../services/prisma.service'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'
import { EventifySourceFile, GeneratorHook, PrismaAPI } from '../types'
import { EventService } from '../services/eventify.service'
import { ConfigService } from '../services/config.service'

/**
 * @description ** ServiceGenerator **
 * Generator class to generate a typescript AST-syntax bundle for models services.
 */
export default class ServiceGenerator {
  private sourceFiles: EventifySourceFile[] = []
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private eventService = new EventService()
  ) {
    this.loadSourceFiles()
  }

  /**
   * @description For each model defined in the schema generates its source file (<model>.service.ts).
   */
  private loadSourceFiles() {
    this.prismaService.models.forEach((model) => {
      if (!this.configService.modelAllowed(model.name)) return
      const sourceFile = createSourceFile(`${model.name.toLowerCase()}.service.ts`)
      this.sourceFiles.push({
        ...sourceFile,
        model: model.name.toLowerCase(),
      })
    })
  }

  /**
   * @description For each source file loaded in the class generates its service class <model>.service.ts
   * @returns {boolean} Generation status.
   */
  public async generateBundle(): Promise<boolean> {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

    const status: boolean[] = await Promise.all(
      this.sourceFiles.map(async (sourceFile) => {
        try {
          const path = await this.configService.buildPath(sourceFile.fileName, '/services')
          const file = printer.printNode(
            ts.EmitHint.SourceFile,
            ts.factory.updateSourceFile(sourceFile, [
              this.prismaService.prismaClientImport(),
              this.busHandlerImport,
              this.prismaService.generatePrismaClientModelsImport([sourceFile.model]),
              this.generateModelServiceClass(sourceFile.model),
            ]),
            sourceFile
          )
          await fs.promises.writeFile(path, file, { flag: 'w' })
          return fs.existsSync(path)
        } catch (err) {
          console.error(err)
          return false
        }
      })
    )
    return !status.includes(false)
  }

  /**
   * @description Generates service class construtor:
   * constructor(private busHandler: BusHandler, private prisma = new PrismaClient()) {
   *   prisma.$connect()
   * }
   * @returns {ts.ConstructorDeclaration}
   */
  private get serviceConstructor(): ts.ConstructorDeclaration {
    return ts.factory.createConstructorDeclaration(
      /* modifiers */ undefined,
      /* params */ [
        ts.factory.createParameterDeclaration(
          /* modifiers */ [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
          /* dotDotToken */ undefined,
          /* name */ ts.factory.createIdentifier('busHandler'),
          /* questionToken */ undefined,
          /* type */ ts.factory.createTypeReferenceNode('BusHandler', [])
        ),
        ts.factory.createParameterDeclaration(
          /* modifiers */ [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
          /* dotDotToken */ undefined,
          /* name */ ts.factory.createIdentifier('prisma'),
          /* questionToken */ undefined,
          /* type */ undefined,
          /* initalizer */ ts.factory.createNewExpression(ts.factory.createIdentifier('PrismaClient'), undefined, [])
        ),
      ],
      /* body */ ts.factory.createBlock(
        [
          /* expression */ ts.factory.createExpressionStatement(
            /* expression */ ts.factory.createCallExpression(
              /* expression */ ts.factory.createPropertyAccessExpression(
                /* expression */ ts.factory.createIdentifier('prisma'),
                /* name */ ts.factory.createIdentifier('$connect')
              ),
              /* typeArgs */ undefined,
              /* Args */ []
            )
          ),
        ],
        /* multiline */ true
      )
    )
  }

  /**
   * @description generates import declaration for Eventify BusHandler:
   * - prod: import type { BusHandler } from 'prisma-eventify'
   * - dev: import type { BusHandler } from './../../src/handlers/bus.handler'
   * */
  private get busHandlerImport() {
    return ts.factory.createImportDeclaration(
      /* modifiers */ undefined,
      ts.factory.createImportClause(
        /* isTypeOnly */ true,
        /* name (default import) */ undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('BusHandler')),
        ])
      ),
      ts.factory.createStringLiteral(
        process.env.NODE_ENV === 'develop' ? './../../src/handlers/bus.handler' : 'prisma-eventify'
      )
    )
  }

  /**
   * @description Given a model name generates its service class:
   * import { PrismaClient } from "@prisma/client";
   * import type { BusHandler } from "prisma-eventify";
   * import type { <Model> } from "@prisma/client";
   * export class <Model>Service {
   *  constructor(private busHandler: BusHandler, private prisma = new PrismaClient()) {
   *      prisma.$connect();
   *  }
   *  ...modelMethods
   *  ...modelSetters
   *  ...modelGetters
   * }
   * @param {string} modelName
   * @returns {ts.ClassDeclaration}
   */
  private generateModelServiceClass(modelName: string): ts.ClassDeclaration {
    const model = this.prismaService.getModel(modelName)
    return ts.factory.createClassDeclaration(
      /* modifiers */ [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      /* name */ `${capitalize(modelName)}Service`,
      /* typeParams */ [],
      /* heritageClauses */ [],
      /* members */ model
        ? [
            /* member */ this.serviceConstructor,
            /* member */ ...Object.values(PrismaAPI).map((method) => this.generateModelMethod(model.name, method)),
            /* member */ ...model.fields
              .filter((m) => this.configService.modelAllowed(m.name))
              .map((field) =>
                this.configService.fieldAllowed(model.name, field.name)
                  ? this.generateModelFieldGetterMethod(model.name, field)
                  : []
              ),
            /* member */ ...model.fields
              .filter((m) => this.configService.modelAllowed(m.name))
              .map((field) =>
                this.configService.fieldAllowed(model.name, field.name)
                  ? this.generateModelFieldSetterMethod(model.name, field)
                  : []
              ),
          ].flat(2)
        : []
    )
  }

  /**
   * @description Generates a public service model method:
   * public async <method>(
   *   args: Parameters<typeof this.prisma.<model>.<method>[0] = {}
   * ): Promise<ReturnType<typeof this.prisma.<model>.<method><typeof args>>> {
   *   this.busHandler.publishEvent('<Model>Before<Method>', { args: args, prisma: this.prisma })
   *   var result = await this.prisma.<model>.<method>(args)
   *   this.busHandler.publishEvent('<Model>After<Method>', { args: args, prisma: this.prisma, result: result })
   *   return result
   * }
   * @param {string} model Service class.
   * @param {string} method Service method.
   * @returns {ts.MethodDeclaration}
   */
  private generateModelMethod(model: string, method: PrismaAPI): ts.MethodDeclaration {
    return ts.factory.createMethodDeclaration(
      /* modifiers */ [
        ts.factory.createModifier(ts.SyntaxKind.PublicKeyword),
        ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword),
      ],
      /* asteriskToken */ undefined,
      /* methodName */ method,
      /* questionToken */ undefined,
      /* typeParameters */ undefined,
      /* parameters */ [
        ts.factory.createParameterDeclaration(
          /* modifiers */ undefined,
          /* dotDotDotToken */ undefined,
          /* name */ 'args',
          /* questionToken */ undefined,
          /* type */ ts.factory.createIndexedAccessTypeNode(
            /* objectType */ ts.factory.createTypeReferenceNode('Parameters', [
              /* typeName */ ts.factory.createTypeReferenceNode(`typeof this.prisma.${model.toLowerCase()}.${method}`),
            ]),
            /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
          ),
          /* initializer */ method === 'findMany' ? ts.factory.createObjectLiteralExpression() : undefined
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
        ts.factory.createTypeReferenceNode('ReturnType', [
          /* typeName */ ts.factory.createTypeReferenceNode(
            `typeof this.prisma.${model.toLowerCase()}.${method}<typeof args>`
          ),
        ]),
      ]),
      /* body */ ts.factory.createBlock(
        [
          /* this.busHandler.publishEvent("<Model>Before<Method>", { args: args, prisma: this.prisma }); */ ts.factory.createExpressionStatement(
            /*expression */ ts.factory.createCallExpression(
              /* expression */ ts.factory.createPropertyAccessExpression(
                /* expression */ ts.factory.createIdentifier('this.busHandler'),
                /* name */ ts.factory.createIdentifier('publishEvent')
              ),
              /* typeArgs */ undefined,
              /* argsArray */ [
                ts.factory.createStringLiteral(
                  /* text **/ this.eventService.composeEventIdentifiers({
                    model,
                    hook: GeneratorHook.before,
                    method,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression(
                  /* properties */ [
                    ts.factory.createPropertyAssignment('args', ts.factory.createIdentifier('args')),
                    ts.factory.createPropertyAssignment(
                      'prisma',
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('this'),
                        ts.factory.createIdentifier('prisma')
                      )
                    ),
                  ]
                ),
              ]
            )
          ),
          /* var result = await this.prisma.<model>.<method>(args); */ ts.factory.createVariableStatement(
            /* modifiers */ [],
            /* declarations */ [
              ts.factory.createVariableDeclaration(
                /* name */ ts.factory.createIdentifier('result'),
                /* exclamationToken */ undefined,
                /* type */ undefined,
                /* await */ ts.factory.createAwaitExpression(
                  ts.factory.createCallExpression(
                    /* expression */ ts.factory.createPropertyAccessExpression(
                      /* expression */ ts.factory.createPropertyAccessExpression(
                        /* expression */ ts.factory.createIdentifier('this.prisma'),
                        /* name */ ts.factory.createIdentifier(model.toLowerCase())
                      ),
                      /* name */ ts.factory.createIdentifier(method)
                    ),
                    /* typeArgs */ undefined,
                    /* args */ [ts.factory.createIdentifier('args')]
                  )
                )
              ),
            ]
          ),
          /* this.busHandler.publishEvent("<Model>After<Method>", { args: args, prisma: this.prisma, result }); */ ts.factory.createExpressionStatement(
            /* expression*/ ts.factory.createCallExpression(
              /* expression */ ts.factory.createPropertyAccessExpression(
                /* expression */ ts.factory.createIdentifier('this.busHandler'),
                /* name */ ts.factory.createIdentifier('publishEvent')
              ),
              /* typeArgs */ undefined,
              /* args */ [
                ts.factory.createStringLiteral(
                  this.eventService.composeEventIdentifiers({
                    model,
                    hook: GeneratorHook.after,
                    method,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression(
                  /* properties*/ [
                    ts.factory.createPropertyAssignment('args', ts.factory.createIdentifier('args')),
                    ts.factory.createPropertyAssignment(
                      'prisma',
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('this'),
                        ts.factory.createIdentifier('prisma')
                      )
                    ),
                    ts.factory.createPropertyAssignment('result', ts.factory.createIdentifier('result')),
                  ]
                ),
              ]
            )
          ),
          /* return result; */ ts.factory.createReturnStatement(ts.factory.createIdentifier('result')),
        ],
        /* multiline */ true
      )
    )
  }

  /**
   * @description Generates a public class method for getting the given model's field:
   * public async get<Field>(id: number): Promise<string | null> {
   *     return (await this.prisma.<model>.<field>({ where: { id: id }, select: { <field>: true } }))!.<field>! ?? null;
   * }
   * @param modelName
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  private generateModelFieldGetterMethod(
    modelName: string,
    field: { name: string; type: string }
  ): ts.MethodDeclaration {
    return ts.factory.createMethodDeclaration(
      /* modifiers */ [
        ts.factory.createModifier(ts.SyntaxKind.PublicKeyword),
        ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword),
      ],
      /* asteriskToken */ undefined,
      /* methodName */ `get${capitalize(field.name)}`,
      /* questionToken */ undefined,
      /* typeParams */ undefined,
      /* params */ [
        ts.factory.createParameterDeclaration(
          /* modifiers */ undefined,
          /* dotDotToken */ undefined,
          /* name */ ts.factory.createIdentifier('id'),
          /* type */ undefined,
          /* initializer */ ts.factory.createTypeReferenceNode('number', [])
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode(
        'Promise',
        /* typeArgs */ [
          ts.factory.createUnionTypeNode([
            this.prismaService.prismaToTSType(field.type),
            ts.factory.createTypeReferenceNode('null'),
          ]),
        ]
      ),
      /* body */ ts.factory.createBlock(
        [
          /* statement */ ts.factory.createReturnStatement(
            /* expression */ ts.factory.createBinaryExpression(
              /* left */ ts.factory.createNonNullExpression(
                /* expresison */ ts.factory.createPropertyAccessExpression(
                  /* expression */ ts.factory.createNonNullExpression(
                    /* await */ ts.factory.createAwaitExpression(
                      /* expression */ ts.factory.createCallExpression(
                        /* expression */ ts.factory.createPropertyAccessExpression(
                          /* expression */ ts.factory.createPropertyAccessExpression(
                            /* expression */ ts.factory.createIdentifier('this.prisma'),
                            /* name */ ts.factory.createIdentifier(modelName.toLowerCase())
                          ),
                          ts.factory.createIdentifier(PrismaAPI.findUnique)
                        ),
                        /* typeArgs */ undefined,
                        /* args */ [
                          ts.factory.createObjectLiteralExpression(
                            /* properties */ [
                              ts.factory.createPropertyAssignment(
                                /* name */ ts.factory.createIdentifier('where'),
                                /* initalizer */ ts.factory.createObjectLiteralExpression(
                                  /* properties */ [
                                    ts.factory.createPropertyAssignment(
                                      ts.factory.createIdentifier('id'),
                                      ts.factory.createIdentifier('id')
                                    ),
                                  ]
                                )
                              ),
                              ts.factory.createPropertyAssignment(
                                /* name */ ts.factory.createIdentifier('select'),
                                /* initalizer */ ts.factory.createObjectLiteralExpression([
                                  ts.factory.createPropertyAssignment(
                                    ts.factory.createIdentifier(field.name),
                                    ts.factory.createTrue()
                                  ),
                                ])
                              ),
                            ]
                          ),
                        ]
                      )
                    )
                  ),
                  /* name */ ts.factory.createIdentifier(field.name)
                )
              ),
              /* operator */ ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
              /* right */ ts.factory.createNull()
            )
          ),
        ],
        /* multiline */ true
      )
    )
  }

  /**
   * @description Generates a public class method for setting the given model's field:
   * public async set<Model>(id: number, <field>: string): Promise<User> {
   *     this.busHandler.publishEvent("<Model><Field>Before<Method>", { args: { where: { id: id }, data: { <field>: <field> } }, prisma: this.prisma });
   *     const result = await this.prisma.<model>.update({ where: { id: id }, data: { <field>: <field> } });
   *     this.busHandler.publishEvent("<Model><Field>After<Method>", { where: { id: id }, data: { <field>: <field> } }, prisma: this.prisma, result: result });
   *     return result;
   * }
   * @param model
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  private generateModelFieldSetterMethod(model: string, field: { name: string; type: string }): ts.MethodDeclaration {
    /* public async set<Model>(id: number, <field>: string): Promise<<Model>> */
    return ts.factory.createMethodDeclaration(
      /* modifiers */ [
        ts.factory.createModifier(ts.SyntaxKind.PublicKeyword),
        ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword),
      ],
      /* asteriskToken */ undefined,
      /* methodName */ `set${capitalize(field.name)}`,
      /* questionToken */ undefined,
      /* typeParams */ undefined,
      /* params */ [
        ts.factory.createParameterDeclaration(
          /* modifiers */ undefined,
          /* dotDotToken */ undefined,
          /* name */ ts.factory.createIdentifier('id'),
          /* questionToken */ undefined,
          /* type */ ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        ),
        ts.factory.createParameterDeclaration(
          /* modifiers */ undefined,
          /* dotDotToken */ undefined,
          /* name */ ts.factory.createIdentifier(field.name),
          /* questionToken */ undefined,
          /* type */ this.prismaService.prismaToTSType(field.type)
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
        ts.factory.createTypeReferenceNode(capitalize(model), []),
      ]),
      /* body */ ts.factory.createBlock(
        [
          /* statement */ ts.factory.createExpressionStatement(
            /* expression */ ts.factory.createCallExpression(
              /* expression */ ts.factory.createPropertyAccessExpression(
                /* expression */ ts.factory.createIdentifier('this.busHandler'),
                /* name */ ts.factory.createIdentifier('publishEvent')
              ),
              /* typeArgs */ undefined,
              /* args */ [
                ts.factory.createStringLiteral(
                  this.eventService.composeEventIdentifiers({
                    model,
                    field: field.name,
                    hook: GeneratorHook.before,
                    method: PrismaAPI.update,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression(
                  /* properties */ [
                    ts.factory.createPropertyAssignment(
                      /* name */ 'args',
                      /* initalizer */ ts.factory.createObjectLiteralExpression(
                        /* properties */ [
                          ts.factory.createPropertyAssignment(
                            /* name */ ts.factory.createIdentifier('where'),
                            /* initializer */ ts.factory.createObjectLiteralExpression(
                              /* properties */ [
                                ts.factory.createPropertyAssignment(
                                  /* name */ ts.factory.createIdentifier('id'),
                                  /* initalizer */ ts.factory.createIdentifier('id')
                                ),
                              ]
                            )
                          ),
                          ts.factory.createPropertyAssignment(
                            /* name */ ts.factory.createIdentifier('data'),
                            /* initalizer */ ts.factory.createObjectLiteralExpression(
                              /* properties */ [
                                ts.factory.createPropertyAssignment(
                                  ts.factory.createIdentifier(field.name),
                                  ts.factory.createIdentifier(field.name)
                                ),
                              ]
                            )
                          ),
                        ]
                      )
                    ),
                    ts.factory.createPropertyAssignment(
                      /* name */ 'prisma',
                      /* initalizer */ ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('this'),
                        ts.factory.createIdentifier('prisma')
                      )
                    ),
                  ]
                ),
              ]
            )
          ),
          /* statement */ ts.factory.createVariableStatement(
            /* modifiers */ [],
            /* declarations */ ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  /* name */ ts.factory.createIdentifier('result'),
                  /* exclamationToken */ undefined,
                  /* type */ undefined,
                  /* initializer */ ts.factory.createAwaitExpression(
                    /* expression */ ts.factory.createCallExpression(
                      /* expression */ ts.factory.createPropertyAccessExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createIdentifier('this.prisma'),
                          ts.factory.createIdentifier(model.toLowerCase())
                        ),
                        ts.factory.createIdentifier(PrismaAPI.update)
                      ),
                      /* typeArgs */ undefined,
                      /* args */ [
                        ts.factory.createObjectLiteralExpression(
                          /* properties */ [
                            ts.factory.createPropertyAssignment(
                              /* name */ ts.factory.createIdentifier('where'),
                              /* initializer */ ts.factory.createObjectLiteralExpression(
                                /* properties */ [
                                  ts.factory.createPropertyAssignment(
                                    /* name */ ts.factory.createIdentifier('id'),
                                    /* initalizer */ ts.factory.createIdentifier('id')
                                  ),
                                ]
                              )
                            ),
                            ts.factory.createPropertyAssignment(
                              /* name */ ts.factory.createIdentifier('data'),
                              /* initalizer */ ts.factory.createObjectLiteralExpression(
                                /* properties */ [
                                  ts.factory.createPropertyAssignment(
                                    ts.factory.createIdentifier(field.name),
                                    ts.factory.createIdentifier(field.name)
                                  ),
                                ]
                              )
                            ),
                          ]
                        ),
                      ]
                    )
                  )
                ),
              ],
              ts.NodeFlags.Const
            )
          ),
          /* statement */ ts.factory.createExpressionStatement(
            /* expression */ ts.factory.createCallExpression(
              /* expression */ ts.factory.createPropertyAccessExpression(
                /* expression */ ts.factory.createIdentifier('this.busHandler'),
                /* name */ ts.factory.createIdentifier('publishEvent')
              ),
              /* typeArgs */ undefined,
              /* args */ [
                ts.factory.createStringLiteral(
                  /* text */ this.eventService.composeEventIdentifiers({
                    model,
                    field: field.name,
                    hook: GeneratorHook.after,
                    method: PrismaAPI.update,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression(
                  /* properties */ [
                    ts.factory.createPropertyAssignment(
                      /* name */ 'args',
                      /* initalizer */ ts.factory.createObjectLiteralExpression(
                        /* properties */ [
                          ts.factory.createPropertyAssignment(
                            /* name */ ts.factory.createIdentifier('where'),
                            /* initializer */ ts.factory.createObjectLiteralExpression(
                              /* properties */ [
                                ts.factory.createPropertyAssignment(
                                  /* name */ ts.factory.createIdentifier('id'),
                                  /* initalizer */ ts.factory.createIdentifier('id')
                                ),
                              ]
                            )
                          ),
                          ts.factory.createPropertyAssignment(
                            /* name */ ts.factory.createIdentifier('data'),
                            /* initalizer */ ts.factory.createObjectLiteralExpression(
                              /* properties */ [
                                ts.factory.createPropertyAssignment(
                                  ts.factory.createIdentifier(field.name),
                                  ts.factory.createIdentifier(field.name)
                                ),
                              ]
                            )
                          ),
                        ]
                      )
                    ),
                    ts.factory.createPropertyAssignment(
                      /* name */ 'prisma',
                      /* initializer */ ts.factory.createPropertyAccessExpression(
                        /* expression */ ts.factory.createIdentifier('this'),
                        /* name */ ts.factory.createIdentifier('prisma')
                      )
                    ),
                    ts.factory.createPropertyAssignment(
                      /* name */ 'result',
                      /* initializer */ ts.factory.createIdentifier('result')
                    ),
                  ]
                ),
              ]
            )
          ),
          /* statement */ ts.factory.createReturnStatement(ts.factory.createIdentifier('result')),
        ],
        /* multiline */ true
      )
    )
  }
}
