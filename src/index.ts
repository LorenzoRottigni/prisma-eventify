import { getDMMF } from '@prisma/internals'
import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper'
import { PrismaService } from './services/prisma.service'
import { ConfigService } from './services/config.service'
import ServiceGenerator from './generators/service.generator'
import { EventGenerator } from './generators/eventify.generator'
import { BusHandler } from './handlers/bus.handler'
import { EventifyConfig } from './types/config'
import { EventifyGenerator } from './types'

export async function generate(datamodel: string, config: EventifyConfig): Promise<boolean> {
  const schema = await getDMMF({ datamodel })
  const [prismaService, configService] = [new PrismaService(schema), new ConfigService(config)]
  const generators: EventifyGenerator[] = [
    new ServiceGenerator(prismaService, configService),
    new EventGenerator(prismaService, configService),
  ]
  return !generators.map((generator) => generator.generateBundle()).includes(false)
}

export function loadEventBus(config: EventifyConfig) {
  const busHandler = new BusHandler(config)
  busHandler.subscribeConfigEvents()
  return busHandler
}

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './dist/bundle',
      prettyName: 'Prisma Eventify',
    }
  },
  async onGenerate({ datamodel, generator }: GeneratorOptions) {
    const config: EventifyConfig = {
      outDir: typeof generator.config?.outDir === 'string' ? typeof generator.config?.outDir : './dist/bundle',
      excludeFields: Array.isArray(generator.config?.excludeFields)
        ? generator.config.excludeFields
        : typeof generator.config?.excludeFields === 'string'
        ? [generator.config?.excludeFields]
        : [],
      excludeModels: Array.isArray(generator.config?.excludeModels)
        ? generator.config.excludeModels
        : typeof generator.config?.excludeModels === 'string'
        ? [generator.config?.excludeModels]
        : [],
    }
    generate(datamodel, config)
  },
})
