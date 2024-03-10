import { EventBus } from 'ts-bus'
import { PrismaService } from '../services/prisma.service'
import { ConfigService } from '../services/config.service'
import { EventifyGenerator } from '../types'
import ts from 'typescript'
import fs from 'fs'
import { createSourceFile } from '../utils'

export class EventGenerator implements EventifyGenerator {
  constructor(
    private prismaService: PrismaService,
    private configService: ConfigService,
    private bus = new EventBus(),
    private sourceFile: ts.SourceFile = createSourceFile('events.ts')
  ) {}

  private get __importCreateEventDefinition(): ts.ImportDeclaration {
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

  private __event(): ts.Statement[] {
    // Create the type literal node for the event payload
    const typeLiteral = ts.factory.createTypeLiteralNode([
      ts.factory.createPropertySignature(
        undefined,
        'id',
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      ),
      ts.factory.createPropertySignature(
        undefined,
        'listId',
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      ),
      ts.factory.createPropertySignature(
        undefined,
        'value',
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      ),
    ])

    // Create an object literal expression using the typeLiteral
    const objectLiteral = ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment('id', ts.factory.createIdentifier('id')),
      ts.factory.createPropertyAssignment('listId', ts.factory.createIdentifier('listId')),
      ts.factory.createPropertyAssignment('value', ts.factory.createIdentifier('value')),
    ])

    // Create the createEventDefinition function call
    const createEventDefinitionCall = ts.factory.createCallExpression(
      ts.factory.createIdentifier('createEventDefinition'),
      [],
      [ts.factory.createParenthesizedExpression(objectLiteral)]
    )

    // Create the type annotation for taskCreated
    const ReturnType = ts.factory.createTypeReferenceNode('ReturnType', [typeLiteral])

    // Create the variable declaration for taskCreated
    const taskCreatedDeclaration = ts.factory.createVariableDeclaration(
      'taskCreated',
      undefined,
      ReturnType,
      createEventDefinitionCall
    )

    // Create the variable statement
    const taskCreatedStatement = ts.factory.createVariableStatement(undefined, [taskCreatedDeclaration])

    // Create the export specifier
    const exportSpecifier = ts.factory.createExportSpecifier(false, 'taskCreated', 'pippo')

    // Create the named exports
    const namedExports = ts.factory.createNamedExports([exportSpecifier])

    // Create the export statement wrapping the named exports in an expression context
    const exportStatement = ts.factory.createExportDeclaration(
      undefined,
      false,
      undefined,
      ts.factory.createIdentifier('dummy') // This is a placeholder expression
    )

    // Return an array of nodes to be added to the source file
    return [taskCreatedStatement, exportStatement]
  }

  private __export() {
    return ts.factory.createExportDeclaration(
      undefined,
      false,
      ts.factory.createNamedExports([ts.factory.createExportSpecifier(false, 'taskCreated', 'thename')])
    )
  }

  public generateBundle(): boolean {
    try {
      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const filename = this.configService.buildPath(this.sourceFile.fileName)
      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(this.sourceFile, [this.__importCreateEventDefinition, ...this.__event()]),
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
