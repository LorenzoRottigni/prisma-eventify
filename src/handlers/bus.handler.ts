import { EventBus } from 'ts-bus'
import * as events from './../../codegen/events'
import config from './../../config.events'

export class BusHandler {
  constructor(public bus = new EventBus()) {}

  public subscribeConfigEvents() {
    Object.entries(config).forEach(([event, callback]) => {
      this.bus.subscribe(events[event], callback)
    })
  }

  /**
   * @description Generated service side:
   * this.busHandler.publishEvent('UserBeforeFindMany', { args, prisma: this.prisma })
   * @param event
   * @param meta
   * @returns
   */
  public publishEvent(event: string, meta: any) {
    if (!events?.[event]) return false
    this.bus.publish(events[event], meta)
    return true
  }
}
