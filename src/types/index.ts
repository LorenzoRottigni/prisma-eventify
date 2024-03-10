import ts from 'typescript'

export declare type EventifySourceFile = ts.SourceFile & { model: string }

export declare interface EventifyGenerator {
  generateBundle(): boolean
}
