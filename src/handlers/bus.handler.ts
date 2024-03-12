import { EventBus } from 'ts-bus'
import * as events from './../../codegen/events'
import config from './../../config.events'
import { EventService } from './../services/event.service'
import { PrismaService } from './../services/prisma.service'
import { PrismaAPI } from '../types'

export class BusHandler {
  constructor(
    private prismaService: PrismaService,
    public bus = new EventBus(),
    private eventService = new EventService()
  ) {}

  public subscribeConfigEvents() {
    Object.entries(config).forEach(([event, callback]) => {
      this.bus.subscribe(events[event], callback)
    })
  }

  public publishEvent(event: string, meta: any) {
    if (!events?.[event]) return false
    const { model, field, hook, method } = this.eventService.destructureEventIdentifiers(events[event].toString())

    /* publish also model fields events */
    if (model && !field && method && [PrismaAPI.create, PrismaAPI.update, PrismaAPI.delete].includes(method)) {
      const fields = this.prismaService.getModelFields(model)
      fields.forEach(({ name: field }) => {
        const fieldEvent = this.eventService.composeEventIdentifiers({
          model,
          field,
          hook,
          method,
        }).camelCase
        if (events[fieldEvent]) this.bus.publish(events[fieldEvent], meta)
      })
    }

    this.bus.publish(events[event], meta)
    return true
  }
}
