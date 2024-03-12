import { getDMMF } from '@prisma/internals'
import { ecommerceDatamodel as datamodel } from './data/ecommerce.schema'
import ServiceGenerator from '../src/generators/service.generator'
import config from './data/eventify.config'
import fs from 'fs'
import { PrismaService } from '../src/services/prisma.service'
import { ConfigService } from '../src/services/config.service'
import { EventGenerator } from '../src/generators/event.generator'
import { UserService } from '../codegen/user.service'
import { BusHandler } from '../src/handlers/bus.handler'

describe('Model Services Generator', () => {
  it('Should generate services bundle.', async () => {
    const schema = await getDMMF({ datamodel })
    const prismaService = new PrismaService(schema)
    const configService = new ConfigService(config)
    const generator = new ServiceGenerator(prismaService, configService)
    expect(generator.generateBundle()).toBe(true)
    expect(fs.readdirSync(config.outDir).filter((f) => f.includes('.service')).length).toBe(
      schema.datamodel.models.length - config.excludeModels.length
    )
  })

  it('Should generate events bundle.', async () => {
    const schema = await getDMMF({ datamodel })
    const prismaService = new PrismaService(schema)
    const configService = new ConfigService(config)
    const generator = new EventGenerator(prismaService, configService)
    expect(generator.generateBundle()).toBe(true)
  })

  it('Should create a new user.', async () => {
    const schema = await getDMMF({ datamodel })
    const prismaService = new PrismaService(schema)
    const busHandler = new BusHandler(prismaService)
    const userService = new UserService(undefined, busHandler)

    const user = userService.create({
      data: {
        email: 'lorenzo@rottigni.net',
        password: 'password',
        username: 'lorenzorottigni',
        createdAt: new Date(),
      },
    })

    expect(user).toBeTruthy()
  })

  // it('Should generate configuration bundle.', async () => {
  //   const schema = await getDMMF({ datamodel })
  //   const prismaService = new PrismaService(schema)
  //   const configService = new ConfigService(config)
  //   const busHandler = new BusHandler(prismaService, configService)
  //   expect(busHandler.generateBundle()).toBeTruthy()
  // })
})
