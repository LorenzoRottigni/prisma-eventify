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
  private config: any
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

  public async subscribeConfigEvents() {
    // @ts-expect-error WIP
    this.events = await import('./../../eventify/events')
    this.config = await import('./../../eventify.config')

    Object.entries(this.config).forEach(([event, callback]) => {
      // @ts-expect-error WIP
      this.bus.subscribe(this.events[event], callback)
    })
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
