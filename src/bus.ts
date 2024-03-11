import { EventBus } from 'ts-bus'
import { UserUsernameBeforeFindMany } from '../codegen/events'
export const bus = new EventBus()

bus.subscribe(UserUsernameBeforeFindMany, ({ payload, type }) => {})
