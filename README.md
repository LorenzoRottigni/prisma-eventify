# Prisma-Eventify

Prisma-Eventify is a crucial module designed to facilitate seamless communication between the ORM (Prisma) and the HTTP server (GraphQL | Rest) by employing event-driven development principles.

It comprises a set of generated service classes (e.g., user.service.ts) that serve as intermediaries for communicating with the ORM, thereby enabling event-driven development. Each method within these service classes is equipped with standard-named generated events for various hooks (before, after). These events serve as entry points for integrating validations, mutations, and custom logics, ensuring flexibility and reliability in your application architecture.

Automatically subscribed to an event bus, these generated events streamline the flow of data and actions between your ORM and HTTP server. Additionally, Prisma-Eventify generates an eventify.config.ts file in the project's root, containing example event handler callback functions for each subscribed generated event.

When the HTTP server utilizes one of these generated services, a cascade of events for each hook is published to the event bus. This triggers the execution of custom subscribed callbacks defined within eventify.config.ts, empowering you to seamlessly implement and customize your application's behavior according to your specific requirements.

## Getting Started

To get started with Prisma-Eventify, follow these steps:

1. Add the generator to schema.prisma:

```prisma
generator client {
  provider        = "prisma-eventify"
  excludeModels   = []
  excludeFields   = ["id"]
}
```

2. Load the event bus inside you application:

```typescript
import { loadEventBus } from 'prisma-eventify'

const eventBus = loadEventBus({
    /* Excluded models */
    excludeModels: [],
    /* Excluded fields for all models */
    excludeFields: ['id'],
    /* Inject your application context */
    context: this.ctx
})
```

## Context Injection

As previously described, it's possible to inject your own application context into event handler callback functions. However, this context may vary depending on the background framework being used...

### NuxtJS

Injecting the NuxtJS context inside the event bus and the event bus itself inside NuxtJS context:

```typescript
import { loadEventBus } from 'prisma-eventify'

export default defineNuxtPlugin(nuxtApp => {
  return {
    provide: {
      eventBus: () => loadEventBus({
          /* Excluded models */
          excludeModels: [],
          /* Excluded fields for all models */
          excludeFields: ['id'],
          /* Inject your application context */
          context: nuxtApp
      })
    }
  }
})
```

## Contributing

Clone this repository:

```bash
https://github.com/LorenzoRottigni/prisma-eventify.git
cd prisma-eventify
code .
```

Run a Postgres DB:
```bash
docker run --name postgres-container -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgres
```

Prepare environment:
```bash
yarn
yarn prisma:generate --schema=tests/prisma/schema.prisma
yarn prisma:migrate dev --schema=tests/prisma/schema.prisma
```

Testing:
```bash
yarn test
```