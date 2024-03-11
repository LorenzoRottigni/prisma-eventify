import type * as PrismaClientExports from '@prisma/client'

export declare interface EventifyConfig {
  excludeFields: string[]
  excludeModels: string[]
  outDir: string
  /* Create an event on event bus that resolves the context */
  context?: unknown
}
