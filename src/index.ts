import { getDMMF } from '@prisma/internals'
import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper'
import { PrismaService } from './services/prisma.service'
import { ConfigService } from './services/config.service'
import ServiceGenerator from './generators/service.generator'
import { EventGenerator } from './generators/eventify.generator'
import { BusHandler } from './handlers/bus.handler'
import { EventifyConfig } from './types/config'
import { EventifyGenerator } from './types'

async function getServices(datamodel: string, config: EventifyConfig): Promise<[PrismaService, ConfigService]> {
  const schema = await getDMMF({ datamodel })
  return [new PrismaService(schema), new ConfigService(config)]
}

export async function main<Standalone extends boolean>(
  datamodel: string,
  config: EventifyConfig,
  standalone: Standalone = false as Standalone
): Promise<Standalone extends true ? null : BusHandler> {
  const [prismaService, configService] = await getServices(datamodel, config)
  const generators: EventifyGenerator[] = [
    new ServiceGenerator(prismaService, configService),
    new EventGenerator(prismaService, configService),
  ]
  const generationStatus = generators.map((generator) => generator.generateBundle())
  if (generationStatus.includes(false))
    throw new Error('Something went wrong while trying to generate eventify bundle.')
  if (standalone) {
    const busHandler = new BusHandler(prismaService, configService)
    busHandler.subscribeConfigEvents()
    return busHandler as Standalone extends true ? null : BusHandler
  } else {
    return null as Standalone extends true ? null : BusHandler
  }
}

export async function getBusHandler(datamodel: string, config: EventifyConfig) {
  const [prismaService, configService] = await getServices(datamodel, config)

  const busHandler = new BusHandler(prismaService, configService)
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
    main(datamodel, config, true)
  },
})
