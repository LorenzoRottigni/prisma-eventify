import { PrismaService } from '../services/prisma.service'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'
import { EventifySourceFile, GeneratorHook, PrismaAPI } from '../types'
import { EventService } from '../services/eventify.service'
import { ConfigService } from '../services/config.service'

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
   * @description Given a model and a prisma ORM method name generates the model service method.
   * @param {string} model Service class.
   * @param {string} methodName Service method.
   * @returns {ts.MethodDeclaration}
   */
  public generateModelMethod(model: string, method: PrismaAPI): ts.MethodDeclaration {
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
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('this.busHandler'),
                ts.factory.createIdentifier('publishEvent')
              ),
              undefined,
              [
                ts.factory.createStringLiteral(
                  this.eventService.composeEventIdentifiers({
                    model,
                    hook: GeneratorHook.before,
                    method,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment('args', ts.factory.createIdentifier('args')),
                  ts.factory.createPropertyAssignment(
                    'prisma',
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier('this'),
                      ts.factory.createIdentifier('prisma')
                    )
                  ),
                ]),
              ]
            )
          ),
          ts.factory.createVariableStatement(
            [],
            [
              ts.factory.createVariableDeclaration(
                ts.factory.createIdentifier('result'),
                undefined,
                undefined, // Explicitly set type to undefined
                ts.factory.createAwaitExpression(
                  ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createIdentifier('this.prisma'),
                        ts.factory.createIdentifier(model.toLowerCase())
                      ),
                      ts.factory.createIdentifier(method)
                    ),
                    undefined,
                    [ts.factory.createIdentifier('args')]
                  )
                )
              ),
            ]
          ),
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('this.busHandler'),
                ts.factory.createIdentifier('publishEvent')
              ),
              undefined,
              [
                ts.factory.createStringLiteral(
                  this.eventService.composeEventIdentifiers({
                    model,
                    hook: GeneratorHook.after,
                    method,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment('args', ts.factory.createIdentifier('args')),
                  ts.factory.createPropertyAssignment(
                    'prisma',
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier('this'),
                      ts.factory.createIdentifier('prisma')
                    )
                  ),
                  ts.factory.createPropertyAssignment('result', ts.factory.createIdentifier('result')),
                ]),
              ]
            )
          ),
          ts.factory.createReturnStatement(ts.factory.createIdentifier('result')),
        ],
        /* multiline */ true
      )
    )
  }

  /**
   * @description Given a model name generates its service class.
   * @param {string} modelName
   * @returns {ts.ClassDeclaration}
   */
  private generateModelServiceClass(modelName: string): ts.ClassDeclaration {
    const model = this.prismaService.getModel(modelName)
    return ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      `${capitalize(modelName)}Service`,
      [],
      [],
      model
        ? [
            this.serviceConstructor,
            ...Object.values(PrismaAPI).map((method) => this.generateModelMethod(model.name, method)),
            ...model.fields
              .filter((m) => this.configService.modelAllowed(m.name))
              .map((field) =>
                this.configService.fieldAllowed(model.name, field.name)
                  ? this.generateFieldGetterMethod(model.name, field)
                  : []
              ),
            ...model.fields
              .filter((m) => this.configService.modelAllowed(m.name))
              .map((field) =>
                this.configService.fieldAllowed(model.name, field.name)
                  ? this.generateFieldSetterMethod(model.name, field)
                  : []
              ),
          ].flat(2)
        : []
    )
  }

  /**
   * @description Generates service class construtor:
   * constructor(private prisma = new PrismaClient()) {
   *  prisma.$connect();
   * }
   * @returns {ts.ConstructorDeclaration}
   */
  private get serviceConstructor(): ts.ConstructorDeclaration {
    return ts.factory.createConstructorDeclaration(
      undefined,
      [
        ts.factory.createParameterDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)],
          undefined,
          ts.factory.createIdentifier('busHandler'),
          undefined,
          ts.factory.createTypeReferenceNode('BusHandler', [])
        ),
        ts.factory.createParameterDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)], // Modifier: private
          undefined,
          ts.factory.createIdentifier('prisma'), // Parameter name
          undefined, // Type annotation (optional)
          undefined,
          ts.factory.createNewExpression(
            ts.factory.createIdentifier('PrismaClient'), // Class name for construction
            undefined, // Type arguments (optional)
            [] // Empty arguments array
          )
        ),
      ],
      ts.factory.createBlock(
        [
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('prisma'),
                ts.factory.createIdentifier('$connect')
              ),
              undefined,
              []
            )
          ),
        ],
        true
      )
    )
  }

  /**
   * @description Generates a public class method for getting the given model's field:
   * ex. async function getUserEmail(id: number): Promise<string | null>
   * @param modelName
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  private generateFieldGetterMethod(modelName: string, field: { name: string; type: string }): ts.MethodDeclaration {
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
          undefined,
          undefined,
          ts.factory.createIdentifier('id'),
          undefined,
          ts.factory.createTypeReferenceNode('number', [])
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
        ts.factory.createUnionTypeNode([
          this.prismaService.prismaToTSType(field.type),
          ts.factory.createTypeReferenceNode('null'),
        ]),
      ]),
      /* body */ ts.factory.createBlock(
        [
          ts.factory.createReturnStatement(
            ts.factory.createBinaryExpression(
              ts.factory.createNonNullExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createNonNullExpression(
                    ts.factory.createAwaitExpression(
                      ts.factory.createCallExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createPropertyAccessExpression(
                            ts.factory.createIdentifier('this.prisma'),
                            ts.factory.createIdentifier(modelName.toLowerCase())
                          ),
                          ts.factory.createIdentifier(PrismaAPI.findUnique)
                        ),
                        undefined,
                        [
                          ts.factory.createObjectLiteralExpression([
                            ts.factory.createPropertyAssignment(
                              ts.factory.createIdentifier('where'),
                              ts.factory.createObjectLiteralExpression([
                                ts.factory.createPropertyAssignment(
                                  ts.factory.createIdentifier('id'),
                                  ts.factory.createIdentifier('id')
                                ),
                              ])
                            ),
                            ts.factory.createPropertyAssignment(
                              ts.factory.createIdentifier('select'),
                              ts.factory.createObjectLiteralExpression([
                                ts.factory.createPropertyAssignment(
                                  ts.factory.createIdentifier(field.name),
                                  ts.factory.createTrue()
                                ),
                              ])
                            ),
                          ]),
                        ]
                      )
                    )
                  ),
                  ts.factory.createIdentifier(field.name)
                )
              ),
              ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
              ts.factory.createNull()
            )
          ),
        ],
        true
      )
    )
  }

  /**
   * @description Generates a public class method for setting the given model's field:
   * ex. async function setUserEmail(id: number, user: string): Promise<User>
   * @param model
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  private generateFieldSetterMethod(model: string, field: { name: string; type: string }): ts.MethodDeclaration {
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
          undefined,
          undefined,
          ts.factory.createIdentifier('id'),
          undefined,
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
        ),
        ts.factory.createParameterDeclaration(
          undefined,
          undefined,
          ts.factory.createIdentifier(field.name),
          undefined,
          this.prismaService.prismaToTSType(field.type)
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
        ts.factory.createTypeReferenceNode(capitalize(model), []),
      ]),
      /* body */ ts.factory.createBlock(
        [
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('this.busHandler'),
                ts.factory.createIdentifier('publishEvent')
              ),
              undefined,
              [
                ts.factory.createStringLiteral(
                  this.eventService.composeEventIdentifiers({
                    model,
                    field: field.name,
                    hook: GeneratorHook.before,
                    method: PrismaAPI.update,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment(
                    'args',
                    ts.factory.createObjectLiteralExpression([
                      ts.factory.createPropertyAssignment('id', ts.factory.createIdentifier('id')),
                      ts.factory.createPropertyAssignment(model, ts.factory.createIdentifier(field.name)),
                    ])
                  ),
                  ts.factory.createPropertyAssignment(
                    'prisma',
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier('this'),
                      ts.factory.createIdentifier('prisma')
                    )
                  ),
                ]),
              ]
            )
          ),
          ts.factory.createVariableStatement(
            [],
            ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier('result'),
                  undefined,
                  undefined,
                  ts.factory.createAwaitExpression(
                    ts.factory.createCallExpression(
                      ts.factory.createPropertyAccessExpression(
                        ts.factory.createPropertyAccessExpression(
                          ts.factory.createIdentifier('this.prisma'),
                          ts.factory.createIdentifier(model.toLowerCase())
                        ),
                        ts.factory.createIdentifier(PrismaAPI.update)
                      ),
                      undefined,
                      [
                        ts.factory.createObjectLiteralExpression([
                          ts.factory.createPropertyAssignment(
                            ts.factory.createIdentifier('where'),
                            ts.factory.createObjectLiteralExpression([
                              ts.factory.createPropertyAssignment(
                                ts.factory.createIdentifier('id'),
                                ts.factory.createIdentifier('id')
                              ),
                            ])
                          ),
                          ts.factory.createPropertyAssignment(
                            ts.factory.createIdentifier('data'),
                            ts.factory.createObjectLiteralExpression([
                              ts.factory.createPropertyAssignment(
                                ts.factory.createIdentifier(field.name),
                                ts.factory.createIdentifier(field.name)
                              ),
                            ])
                          ),
                        ]),
                      ]
                    )
                  )
                ),
              ],
              ts.NodeFlags.Const
            )
          ),
          ts.factory.createExpressionStatement(
            ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(
                ts.factory.createIdentifier('this.busHandler'),
                ts.factory.createIdentifier('publishEvent')
              ),
              undefined,
              [
                ts.factory.createStringLiteral(
                  this.eventService.composeEventIdentifiers({
                    model,
                    field: field.name,
                    hook: GeneratorHook.after,
                    method: PrismaAPI.update,
                  }).camelCase
                ),
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment(
                    'args',
                    ts.factory.createObjectLiteralExpression([
                      ts.factory.createPropertyAssignment('id', ts.factory.createIdentifier('id')),
                      ts.factory.createPropertyAssignment(model.toLowerCase(), ts.factory.createIdentifier(field.name)),
                    ])
                  ),
                  ts.factory.createPropertyAssignment(
                    'prisma',
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier('this'),
                      ts.factory.createIdentifier('prisma')
                    )
                  ),
                  ts.factory.createPropertyAssignment('result', ts.factory.createIdentifier('result')),
                ]),
              ]
            )
          ),
          ts.factory.createReturnStatement(ts.factory.createIdentifier('result')),
        ],
        /* multiline */ true
      )
    )
  }
}
