import { getDMMF } from '@prisma/internals'
import { ecommerceDatamodel as datamodel } from './data/ecommerce.schema'
import ServiceGenerator from '../src/generators/service.generator'
import config from './data/eventify.config'
import fs from 'fs'
import { PrismaService } from '../src/services/prisma.service'
import { ConfigService } from '../src/services/config.service'
import { EventGenerator } from '../src/generators/eventify.generator'

describe('Model Services Generator', () => {
  it('Should generate services bundle.', async () => {
    const schema = await getDMMF({ datamodel })
    const prismaService = new PrismaService(schema)
    const configService = new ConfigService(config)
    const generator = new ServiceGenerator(prismaService, configService)
    expect(generator.generateBundle()).toBe(true)
  })

  it('Should generate events bundle.', async () => {
    const schema = await getDMMF({ datamodel })
    const prismaService = new PrismaService(schema)
    const configService = new ConfigService(config)
    const generator = new EventGenerator(prismaService, configService)
    expect(generator.generateBundle()).toBe(true)
  })

  // it('Should create a new user.', async () => {
  //   const schema = await getDMMF({ datamodel })
  //   const prismaService = new PrismaService(schema)
  //   const configService = new ConfigService(config)
  //   const busHandler = new BusHandler(prismaService, configService)
  //   const userService = new UserService(busHandler)
  //   const user = await userService.create({
  //     data: {
  //       email: 'lorenzo@rottigni.tech',
  //       password: 'password',
  //       username: 'lorenzorottigni',
  //       createdAt: new Date(),
  //     },
  //   })
  //
  //   expect(user).toBeTruthy()
  // })
})
