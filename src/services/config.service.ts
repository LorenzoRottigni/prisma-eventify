import { EventifyConfig } from '../types/config'

export class ConfigService {
  constructor(protected config: EventifyConfig) {}

  public buildPath(filename: string) {
    return `${this.config.outDir}/${filename}`
  }

  public modelAllowed(model: string): boolean {
    return !this.config.excludeModels.includes(model.toLowerCase())
  }

  public fieldAllowed(model: string, field: string): boolean {
    return !this.config.excludeFields.some((_field) =>
      _field.includes('.')
        ? `${model.toLowerCase()}.${field.toLowerCase()}` === _field.toLowerCase()
        : _field.toLowerCase() === field.toLowerCase()
    )
  }
}
