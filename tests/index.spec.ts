import { getDMMF } from '@prisma/internals'
import { datamodel } from './prisma/schema.prisma'
import ServiceGenerator from '../src/generators/service.generator'
import { PrismaService } from '../src/services/prisma.service'
import { ConfigService } from '../src/services/config.service'
import { EventGenerator } from '../src/generators/eventify.generator'
import { EventifyConfig } from '../src/types/config'
import { Prisma } from '@prisma/client'
import { DMMF } from '@prisma/generator-helper'
import { BusHandler } from '../src/handlers/bus.handler'
import { UserService } from './../eventify/services/user.service'

const config: EventifyConfig = {
  excludeFields: ['id'],
  excludeModels: [],
  outDir: './eventify',
}

describe('Model Services Generator', () => {
  it('Should generate services bundle.', async () => {
    // const schema = await getDMMF({ datamodelPath: 'tests/prisma/schema.prisma' })
    const schema = Prisma.dmmf as DMMF.Document
    const prismaService = new PrismaService(schema)
    const configService = new ConfigService(config)
    const generator = new ServiceGenerator(prismaService, configService)
    expect(await generator.generateBundle()).toBe(true)
  })

  it('Should generate events bundle.', async () => {
    const schema = Prisma.dmmf as DMMF.Document
    const prismaService = new PrismaService(schema)
    const configService = new ConfigService(config)
    const generator = new EventGenerator(prismaService, configService)
    expect(await generator.generateBundle()).toBe(true)
  })

  it('Should create a new user.', async () => {
    const busHandler = new BusHandler(config)
    const userService = new UserService(busHandler)
    const user = await userService.create({
      data: {
        email: `${new Date().getTime()}.lorenzo@rottigni.net`,
        password: 'password',
        username: 'lorenzorottigni',
        createdAt: new Date(),
      },
    })

    expect(user.id).toBeTruthy()
  })
})
