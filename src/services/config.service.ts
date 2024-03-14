import { EventifyConfig } from '../types/config'
import fs from 'fs'
export class ConfigService {
  constructor(protected config: EventifyConfig) {}

  public buildPath(filename: string, baseDir = '') {
    if (!fs.existsSync(this.config.outDir)) {
      fs.mkdirSync(this.config.outDir)
    }
    if (!fs.existsSync(`${this.config.outDir}${baseDir}`)) {
      fs.mkdirSync(`${this.config.outDir}${baseDir}`)
    }
    return `${this.config.outDir}${baseDir}/${filename}`
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
