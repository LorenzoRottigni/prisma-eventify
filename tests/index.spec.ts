import { getDMMF } from '@prisma/internals'
import { ecommerceDatamodel as datamodel } from './data/ecommerce.schema'
import ServiceGenerator from '../src/generators/service.generator'
import config from './data/eventify.config'

describe('Rest API Generator', () => {
  it('Should generate bundle.', async () => {
    const schema = await getDMMF({ datamodel })
    const generator = new ServiceGenerator(schema, config)
    expect(generator.generateBundle()).toBe(true)
  })
})
