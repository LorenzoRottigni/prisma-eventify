import { PrismaService } from '../services/prisma.service'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'
import { EventifySourceFile, PrismaAPI } from '../types'
import { ConfigService } from '../services/config.service'

export default class ServiceGenerator {
  private sourceFiles: EventifySourceFile[] = []
  constructor(private prismaService: PrismaService, private configService: ConfigService) {
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
  public generateBundle(): boolean {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    let status: boolean[] = []
    this.sourceFiles.forEach((sourceFile) => {
      try {
        const filename = this.configService.buildPath(sourceFile.fileName)
        const file = printer.printNode(
          ts.EmitHint.SourceFile,
          ts.factory.updateSourceFile(sourceFile, [
            this.prismaClientImport,
            this.generatePrismaClientModelsImport([sourceFile.model]),
            this.generateModelServiceClass(sourceFile.model),
          ]),
          sourceFile
        )
        fs.writeFileSync(filename, file)
        status.push(fs.existsSync(filename))
      } catch (err) {
        console.error(err)
        status.push(false)
      }
    })
    return !status.includes(false)
  }

  /**
   * @description Given a model and a prisma ORM method name generates the model service method.
   * @param {string} modelName Service class.
   * @param {string} methodName Service method.
   * @returns {ts.MethodDeclaration}
   */
  public generateModelMethod(modelName: string, methodName: string): ts.MethodDeclaration {
    return ts.factory.createMethodDeclaration(
      /* modifiers */ [
        ts.factory.createModifier(ts.SyntaxKind.PublicKeyword),
        ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword),
      ],
      /* asteriskToken */ undefined,
      /* methodName */ methodName,
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
              /* typeName */ ts.factory.createTypeReferenceNode(
                `typeof this.prisma.${modelName.toLowerCase()}.${methodName}`
              ),
            ]),
            /* indexType */ ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral('0'))
          ),
          /* initializer */ methodName === 'findMany' ? ts.factory.createObjectLiteralExpression() : undefined
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
        ts.factory.createTypeReferenceNode('ReturnType', [
          /* typeName */ ts.factory.createTypeReferenceNode(
            `typeof this.prisma.${modelName.toLowerCase()}.${methodName}<typeof args>`
          ),
        ]),
      ]),
      /* body */ ts.factory.createBlock(
        [
          /* return */ ts.factory.createReturnStatement(
            /* await */ ts.factory.createAwaitExpression(
              ts.factory.createCallExpression(
                /* expression */ ts.factory.createPropertyAccessExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier('this.prisma'),
                    ts.factory.createIdentifier(modelName.toLowerCase())
                  ),
                  ts.factory.createIdentifier(`${methodName}<typeof args>`)
                ),
                /* typeArgs */ undefined,
                /* args */ [ts.factory.createIdentifier('args')]
              )
            )
          ),
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
   * @description Get import declaration for one or more Prisma model, by default all models will be included.
   * @param {string[]} models Prisma models to included in the import declaration.
   * @returns {ts.ImportDeclaration}
   */
  private generatePrismaClientModelsImport(
    models: string[] = this.prismaService.models.map((m) => m.name)
  ): ts.ImportDeclaration {
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
  private get prismaClientImport(): ts.ImportDeclaration {
    const module = '@prisma/client'
    const namedImport = 'PrismaClient'
    return ts.factory.createImportDeclaration(
      /* modifiers */ undefined,
      ts.factory.createImportClause(
        /* isTypeOnly */ false,
        /* name (default import) */ undefined,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(namedImport)),
        ])
      ),
      ts.factory.createStringLiteral(module)
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
                          ts.factory.createIdentifier('findUnique')
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
   * @param modelName
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  private generateFieldSetterMethod(modelName: string, field: { name: string; type: string }): ts.MethodDeclaration {
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
          ts.factory.createIdentifier(modelName.toLowerCase()),
          undefined,
          this.prismaService.prismaToTSType(field.type)
        ),
      ],
      /* returnType */ ts.factory.createTypeReferenceNode('Promise', [
        ts.factory.createTypeReferenceNode(capitalize(modelName), []),
      ]),
      /* body */ ts.factory.createBlock(
        [
          ts.factory.createReturnStatement(
            ts.factory.createAwaitExpression(
              ts.factory.createCallExpression(
                ts.factory.createPropertyAccessExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createIdentifier('this.prisma'),
                    ts.factory.createIdentifier(modelName.toLowerCase())
                  ),
                  ts.factory.createIdentifier('update')
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
                          ts.factory.createIdentifier(modelName.toLowerCase())
                        ),
                      ])
                    ),
                  ]),
                ]
              )
            )
          ),
        ],
        true
      )
    )
  }
}
