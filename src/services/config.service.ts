import { EventifyConfig } from '../types/config'
import fs from 'fs'
export class ConfigService {
  constructor(protected config: EventifyConfig) {}

  public async buildPath(filename: string, baseDir = '') {
    try {
      if (!fs.existsSync(this.config.outDir)) {
        try {
          await fs.promises.mkdir(this.config.outDir)
        } catch (err) {
          console.error(err)
        }
      }
      if (!fs.existsSync(`${this.config.outDir}${baseDir}`)) {
        try {
          await fs.promises.mkdir(`${this.config.outDir}${baseDir}`, {
            recursive: true,
          })
        } catch (err) {
          console.error(err)
        }
      }
      return `${this.config.outDir}${baseDir}/${filename}`
    } catch (err) {
      console.error(err)
      return `${this.config.outDir}${baseDir}/${filename}`
    }
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
