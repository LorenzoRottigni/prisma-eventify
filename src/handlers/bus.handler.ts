import { EventBus } from 'ts-bus'

export class BusHandler {
  constructor(public bus = new EventBus()) {}
}
