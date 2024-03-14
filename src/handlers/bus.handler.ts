import path from 'path'
import { EventBus } from 'ts-bus'
import { EventService } from '../services/eventify.service'
import { PrismaService } from './../services/prisma.service'
import { PrismaAPI } from '../types'
import { Prisma, type PrismaClient } from '@prisma/client'
import { ConfigService } from '../services/config.service'
import { DMMF } from '@prisma/generator-helper'
import { EventifyConfig } from '../types/config'

export class BusHandler {
  private events = {}
  private config: Record<string, () => {}>
  constructor(
    config: EventifyConfig,
    schema = Prisma.dmmf as DMMF.Document,
    private prismaService = new PrismaService(schema),
    private configService = new ConfigService(config),
    private eventService = new EventService(),
    public bus = new EventBus()
  ) {
    this.subscribeConfigEvents()
  }

  public async subscribeConfigEvents(): Promise<boolean> {
    try {
      this.events = await import(process.cwd() + '/eventify/events')
      this.config = (await import(process.cwd() + '/eventify.config'))?.config

      if (!Object.keys(this.events).length)
        throw new Error('An error occurred while trying to retrieve generated events.')
      if (!Object.keys(this.config).length)
        throw new Error('An error occurred while trying to retrieve eventify.config.ts.')

      Object.entries(this.config).forEach(([event, callback]) => this.bus.subscribe(this.events[event], callback))

      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  public publishEvent(event: string, meta: { prisma: PrismaClient; [x: string]: any }) {
    if (!this.events?.[event]?.eventType) return false
    const { model, field, hook, method } = this.eventService.destructureEventIdentifiers({
      dotCase: this.events[event].eventType,
    })
    if (!this.configService.modelAllowed(model)) return
    if (model && !field && method && [PrismaAPI.create, PrismaAPI.update, PrismaAPI.delete].includes(method)) {
      /* publish also model fields events */
      const fields = this.prismaService.getModelFields(model)
      fields.forEach(({ name: field }) => {
        if (!this.configService.fieldAllowed(model, field)) return
        const fieldEvent = this.eventService.composeEventIdentifiers({
          model,
          field,
          hook,
          method,
        }).camelCase

        if (this.events[fieldEvent]) this.bus.publish(this.events[fieldEvent](), meta)
      })
    }

    this.bus.publish(this.events[event](), meta)
    return true
  }
}
