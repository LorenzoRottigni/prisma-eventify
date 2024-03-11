import { EventBus } from 'ts-bus'
import * as events from '../../codegen/events'
import { createSourceFile } from '../utils'
import fs from 'fs'
import ts from 'typescript'

// bus.subscribe(UserUsernameBeforeFindMany, ({ payload, type }) => {})

export class BusController {
  constructor(private bus = new EventBus(), private sourceFile = createSourceFile('config.events.ts')) {}

  public generateEventsConfiguration(): boolean {
    try {
      if (fs.existsSync(this.sourceFile.fileName)) return true

      const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      const eventsConfig: ts.ObjectLiteralElementLike[] = Object.keys(events).map((eventName) =>
        ts.factory.createPropertyAssignment(
          ts.factory.createStringLiteral(eventName),
          ts.factory.createIdentifier('() => {}')
        )
      )

      const file = printer.printNode(
        ts.EmitHint.SourceFile,
        ts.factory.updateSourceFile(this.sourceFile, [
          ts.factory.createVariableStatement(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createVariableDeclarationList(
              [
                ts.factory.createVariableDeclaration(
                  ts.factory.createIdentifier('config'),
                  undefined,
                  undefined,
                  ts.factory.createObjectLiteralExpression(eventsConfig, true)
                ),
              ],
              ts.NodeFlags.Const
            )
          ),
          ts.factory.createExportDefault(ts.factory.createIdentifier('config')),
        ]),
        this.sourceFile
      )

      fs.writeFileSync(this.sourceFile.fileName, file)
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }
}
