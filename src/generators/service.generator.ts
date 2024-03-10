import { DMMF } from '@prisma/generator-helper'
import { PrismaService } from '../services/prisma.service'
import ts from 'typescript'
import fs from 'fs'
import { capitalize, createSourceFile } from '../utils'
import { EventifyConfig } from '../types/config'

export default class ServiceGenerator extends PrismaService {
  private sourceFiles: ts.SourceFile[] = []
  constructor(document: DMMF.Document, private config: EventifyConfig) {
    super(document)
    this.schema.datamodel.models.forEach((model) => {
      this.sourceFiles.push(createSourceFile(`${model.name.toLowerCase()}.resolver.ts`))
    })
  }

  public generateBundle(): boolean {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    let status: boolean[] = []
    this.sourceFiles.forEach((sourceFile) => {
      try {
        const filename = `${this.config.outDir}/${sourceFile.fileName}`
        const file = printer.printNode(
          ts.EmitHint.SourceFile,
          ts.factory.updateSourceFile(sourceFile, [
            ...this.__imports,
            this.__modelServiceClass(sourceFile.fileName.split('.')[0]),
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

  public __modelServiceClass(modelName: string): ts.ClassDeclaration {
    const model = this.getModel(modelName)

    return ts.factory.createClassDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      `${capitalize(modelName)}Service`,
      [],
      [],
      [
        ts.factory.createConstructorDeclaration(undefined, [], ts.factory.createBlock([], true)),
        this.__findAllMethod(model?.name || modelName),
        this.__findOneMethod(model?.name || modelName),
        this.__createMethod(model?.name || modelName),
        this.__updateMethod(model?.name || modelName),
        this.__deleteMethod(model?.name || modelName),
        ...(model ? model.fields.map((field) => this.__getterMethod(model.name, field)) : []),
        ...(model ? model.fields.map((field) => this.__setterMethod(model.name, field)) : []),
      ]
    )
  }

  public get __imports(): ts.ImportDeclaration[] {
    return [this.__prismaClientImport, this.__prismaClientModelsImport()]
  }

  public __prismaClientModelsImport(models: string[] = this.models.map((m) => m.name)): ts.ImportDeclaration {
    return ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(
        true,
        undefined,
        ts.factory.createNamedImports(
          models.map((model) => ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier(model)))
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
  public get __prismaClientImport(): ts.ImportDeclaration {
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
   * @description Generates PrismaClient object declaration:
   * const prisma = new PrismaClient()
   * @returns {ts.VariableStatement}
   */
  public get __prismaClientStatement(): ts.VariableStatement {
    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList([
        ts.factory.createVariableDeclaration(
          ts.factory.createIdentifier('prisma'),
          undefined,
          undefined,
          ts.factory.createNewExpression(ts.factory.createIdentifier('PrismaClient'), undefined, [])
        ),
      ])
    )
  }

  /**
   * @description Generates a class method named `findAll` for the given model:
   * ex. async function getUsers(): Promise<User[]>
   * @param modelName
   * @returns {ts.MethodDeclaration}
   */
  public __findAllMethod(modelName: string): ts.MethodDeclaration {
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createArrayTypeNode(ts.factory.createTypeReferenceNode(capitalize(modelName), [])),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__findAllStatement(modelName)],
      true
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      'findAll',
      undefined,
      undefined,
      [],
      returnType,
      body
    )
  }

  /**
   * @description Generates a public class method named `findOne` for the given model:
   * ex. async function findOneUser(id: number): Promise<User | null>
   * @param modelName
   * @returns {ts.MethodDeclaration}
   */
  public __findOneMethod(modelName: string): ts.MethodDeclaration {
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createUnionTypeNode([
        ts.factory.createTypeReferenceNode(capitalize(modelName), []),
        ts.factory.createTypeReferenceNode('null'),
      ]),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__findOneStatement(modelName)],
      true
    )

    const idParameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier('id'),
      undefined,
      ts.factory.createTypeReferenceNode('number', [])
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      'findOne',
      undefined,
      undefined,
      [idParameter],
      returnType,
      body
    )
  }

  /**
   * @description Generates a public class method named `create` for the given model:
   * ex. async function createUser(user: User): Promise<User>
   * @param modelName
   * @returns {ts.MethodDeclaration}
   */
  public __createMethod(modelName: string): ts.MethodDeclaration {
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createTypeReferenceNode(capitalize(modelName), []),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__createStatement(capitalize(modelName))],
      true
    )

    const parameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(modelName.toLowerCase()),
      undefined,
      ts.factory.createTypeReferenceNode(capitalize(modelName), [])
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      'create',
      undefined,
      undefined,
      [parameter],
      returnType,
      body
    )
  }

  /**
   * @description Generates a public class method named `update` for the given model:
   * ex. async function updateUser(id: number, user: User): Promise<User>
   * @param modelName
   * @returns {ts.MethodDeclaration}
   */
  public __updateMethod(modelName: string): ts.MethodDeclaration {
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createTypeReferenceNode(capitalize(modelName), []),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__updateStatement(modelName)],
      true
    )

    const idParameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier('id'),
      undefined,
      ts.factory.createTypeReferenceNode('number', [])
    )

    const parameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(modelName.toLowerCase()),
      undefined,
      ts.factory.createTypeReferenceNode(capitalize(modelName), [])
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      'update',
      undefined,
      undefined,
      [idParameter, parameter],
      returnType,
      body
    )
  }

  /**
   * @description Generates a public class method named `delete` for the given model:
   * ex. async function deleteUser(id: number): Promise<User>
   * @param modelName
   * @returns {ts.MethodDeclaration}
   */
  public __deleteMethod(modelName: string): ts.MethodDeclaration {
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createTypeReferenceNode(capitalize(modelName), []),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__deleteStatement(modelName)],
      true
    )

    const idParameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier('id'),
      undefined,
      ts.factory.createTypeReferenceNode('number', [])
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      'delete',
      undefined,
      undefined,
      [idParameter],
      returnType,
      body
    )
  }

  /**
   * @description Generates a public class method for getting the given model's field:
   * ex. async function getUserEmail(id: number): Promise<string | null>
   * @param modelName
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  public __getterMethod(modelName: string, field: { name: string; type: string }): ts.MethodDeclaration {
    const methodName = `get${capitalize(field.name)}`
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createUnionTypeNode([this.prismaToTSType(field.type), ts.factory.createTypeReferenceNode('null')]),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__getModelFieldStatement(modelName, field.name)],
      true
    )

    const idParameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier('id'),
      undefined,
      ts.factory.createTypeReferenceNode('number', [])
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      methodName,
      undefined,
      undefined,
      [idParameter],
      returnType,
      body
    )
  }

  /**
   * @description Generates a public class method for setting the given model's field:
   * ex. async function setUserEmail(id: number, user: string): Promise<User>
   * @param modelName
   * @param field
   * @returns {ts.MethodDeclaration}
   */
  public __setterMethod(modelName: string, field: { name: string; type: string }): ts.MethodDeclaration {
    const returnType = ts.factory.createTypeReferenceNode('Promise', [
      ts.factory.createTypeReferenceNode(capitalize(modelName), []),
    ])

    const body: ts.Block = ts.factory.createBlock(
      [this.__prismaClientStatement, this.__setModelFieldStatement(modelName, field.name)],
      true
    )

    const idParameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier('id'),
      undefined,
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
    )

    const parameter = ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      ts.factory.createIdentifier(modelName.toLowerCase()),
      undefined,
      this.prismaToTSType(field.type)
    )

    return ts.factory.createMethodDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.PublicKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)],
      undefined,
      `set${capitalize(field.name)}`,
      undefined,
      undefined,
      [idParameter, parameter],
      returnType,
      body
    )
  }

  /**
   * @description Generates the prisma.<model>.findAll statement for the given model:
   * ex. return await prisma.user.findMany();
   * @param modelName
   * @returns {ts.ReturnStatement}
   */
  public __findAllStatement(modelName: string): ts.ReturnStatement {
    return ts.factory.createReturnStatement(
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('prisma'),
              ts.factory.createIdentifier(modelName.toLowerCase())
            ),
            ts.factory.createIdentifier('findMany')
          ),
          undefined,
          []
        )
      )
    )
  }

  /**
   * @description Generates the prisma.<model>.findUnique statement for the given model:
   * ex. return await prisma.user.findUnique();
   * @param modelName
   * @returns {ts.ReturnStatement}
   */
  public __findOneStatement(modelName: string): ts.ReturnStatement {
    const idIdentifier = ts.factory.createIdentifier('id')
    return ts.factory.createReturnStatement(
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('prisma'),
              ts.factory.createIdentifier(modelName.toLowerCase())
            ),
            ts.factory.createIdentifier('findUnique')
          ),
          undefined,
          [
            ts.factory.createObjectLiteralExpression([
              ts.factory.createPropertyAssignment(
                'where',
                ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('id', idIdentifier)])
              ),
            ]),
          ]
        )
      )
    )
  }

  /**
   * @description Generates the prisma.<model>.create statement for the given model:
   * ex. return await prisma.user.create({ data: user });
   * @param modelName
   * @returns {ts.ReturnStatement}
   */
  public __createStatement(modelName: string): ts.ReturnStatement {
    const args = ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier('data'),
        ts.factory.createIdentifier(modelName.toLowerCase())
      ),
    ])
    return ts.factory.createReturnStatement(
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('prisma'),
              ts.factory.createIdentifier(modelName.toLowerCase())
            ),
            ts.factory.createIdentifier('create')
          ),
          undefined,
          [args]
        )
      )
    )
  }

  /**
   * @description Generates the prisma.<model>.update statement for the given model:
   * ex. return await prisma.user.update({ where: { id: id }, data: user });
   * @param modelName
   * @returns {ts.ReturnStatement}
   */
  public __updateStatement(modelName: string): ts.ReturnStatement {
    const args = ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier('where'),
        ts.factory.createObjectLiteralExpression([
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier('id'),
            ts.factory.createIdentifier('id') // Assuming id field for update condition
          ),
        ])
      ),
      ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier('data'),
        ts.factory.createIdentifier(modelName.toLowerCase())
      ),
    ])
    return ts.factory.createReturnStatement(
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('prisma'),
              ts.factory.createIdentifier(modelName.toLowerCase())
            ),
            ts.factory.createIdentifier('update')
          ),
          undefined,
          [args]
        )
      )
    )
  }

  /**
   * @description Generates the prisma.<model>.delete statement for the given model:
   * ex. return await prisma.user.delete({ where: { id: id } });
   * @param modelName
   * @returns {ts.ReturnStatement}
   */
  public __deleteStatement(modelName: string): ts.ReturnStatement {
    return ts.factory.createReturnStatement(
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('prisma'),
              ts.factory.createIdentifier(modelName.toLowerCase())
            ),
            ts.factory.createIdentifier('delete')
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
            ]),
          ]
        )
      )
    )
  }

  /**
   * @description Generates fields getters for the given model:
   * ex. async function getUserUsername(id: number): Promise<string | null>
   * @param modelName
   * @param fieldName
   * @returns {ts.ReturnStatement}
   */
  public __getModelFieldStatement(modelName: string, fieldName: string): ts.ReturnStatement {
    return ts.factory.createReturnStatement(
      ts.factory.createBinaryExpression(
        ts.factory.createNonNullExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createNonNullExpression(
              ts.factory.createAwaitExpression(
                ts.factory.createCallExpression(
                  ts.factory.createPropertyAccessExpression(
                    ts.factory.createPropertyAccessExpression(
                      ts.factory.createIdentifier('prisma'),
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
                            ts.factory.createIdentifier('id') // Assuming id field for lookup
                          ),
                        ])
                      ),
                      ts.factory.createPropertyAssignment(
                        ts.factory.createIdentifier('select'),
                        ts.factory.createObjectLiteralExpression([
                          ts.factory.createPropertyAssignment(
                            ts.factory.createIdentifier(fieldName),
                            ts.factory.createTrue()
                          ),
                        ])
                      ),
                    ]),
                  ]
                )
              )
            ),
            ts.factory.createIdentifier(fieldName)
          )
        ),
        ts.factory.createToken(ts.SyntaxKind.QuestionQuestionToken),
        ts.factory.createNull()
      )
    )
  }

  /**
   * @description Generates fields setters for the given model:
   * ex. return (await prisma.user.findUnique({ where: { id: id }, select: { username: true } }))!.username! ?? null;
   * @param modelName
   * @param fieldName
   * @returns {ts.ReturnStatement}
   */
  public __setModelFieldStatement(modelName: string, fieldName: string): ts.ReturnStatement {
    const args = ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier('where'),
        ts.factory.createObjectLiteralExpression([
          ts.factory.createPropertyAssignment(ts.factory.createIdentifier('id'), ts.factory.createIdentifier('id')),
        ])
      ),
      ts.factory.createPropertyAssignment(
        ts.factory.createIdentifier('data'),
        ts.factory.createObjectLiteralExpression([
          ts.factory.createPropertyAssignment(
            ts.factory.createIdentifier(fieldName),
            ts.factory.createIdentifier(modelName.toLowerCase())
          ),
        ])
      ),
    ])
    return ts.factory.createReturnStatement(
      ts.factory.createAwaitExpression(
        ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createPropertyAccessExpression(
              ts.factory.createIdentifier('prisma'),
              ts.factory.createIdentifier(modelName.toLowerCase())
            ),
            ts.factory.createIdentifier('update')
          ),
          undefined,
          [args]
        )
      )
    )
  }
}
