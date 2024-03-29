import { EventConstituents, EventIdentifiers, GeneratorHook, PrismaAPI } from '../types'
import { capitalize } from '../utils'

export class EventService {
  constructor() {}

  public composeEventIdentifiers(
    { model, field, hook, method }: EventConstituents,
    dotCase = `${model.toLowerCase()}${field ? `.${field}` : ''}${hook ? `.${hook}` : ''}${method ? `.${method}` : ''}`,
    camelCase = `${capitalize(model)}${field ? capitalize(field) : ''}${hook ? capitalize(hook) : ''}${
      method ? capitalize(method) : ''
    }`
  ): EventIdentifiers {
    return {
      camelCase,
      dotCase,
    }
  }

  public destructureEventIdentifiers(
    { dotCase }: Pick<EventIdentifiers, 'dotCase'>,
    chunks = dotCase.split('.')
  ): EventConstituents {
    return chunks.length <= 4
      ? {
          model: chunks[0],
          hook: chunks?.[1] as GeneratorHook,
          method: chunks?.[2] as PrismaAPI,
        }
      : {
          model: chunks[0],
          field: chunks?.[1],
          hook: chunks?.[2] as GeneratorHook,
          method: chunks?.[3] as PrismaAPI,
        }
  }
}
