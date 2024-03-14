import { EventBus } from 'ts-bus'
import * as events from './../../dist/bundle/events'
import config from './../../eventify.config'
import { EventService } from '../services/eventify.service'
import { PrismaService } from './../services/prisma.service'
import { PrismaAPI } from '../types'
import { Prisma, type PrismaClient } from '@prisma/client'
import { ConfigService } from '../services/config.service'
import { DMMF } from '@prisma/generator-helper'
import { EventifyConfig } from '../types/config'

export class BusHandler {
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

  public subscribeConfigEvents() {
    Object.entries(config).forEach(([event, callback]) => {
      this.bus.subscribe(events[event], callback)
    })
  }

  public publishEvent(event: string, meta: { prisma: PrismaClient; [x: string]: any }) {
    if (!events?.[event]?.eventType) return false
    const { model, field, hook, method } = this.eventService.destructureEventIdentifiers({
      dotCase: events[event].eventType,
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

        if (events[fieldEvent]) this.bus.publish(events[fieldEvent](), meta)
      })
    }

    this.bus.publish(events[event](), meta)
    return true
  }
}
