# prisma-eventify

This is meant to be a little framework arranged between the ORM and the HTTP server.
It exposes a set of generated service classes (ex. user.service.ts) used by the HTTP server to communicate with the ORM.
Each method of these classes contains a set of standard-named generated hooks/events that allows the final developer to safely interpolate validations, mutations and custom logics.
Callback handlers for these generated events are defined by the generated config file.

Example flow:
- An orm is choosen ex. Prisma
- A service class is emitted for each model of prisma.schema
- A set of standard-named (with variable model or using params inside the event bus, the eventbus event resolver will forward the event to the correct handler) hooks is applied to each method, the hook refers to an event bus event.
- Library generates a config file containing all empty events designed for the schema (also the config types are generated), it expects a callback function as value.
- An HTTP driver is chosen ex. NestJS, service classes containing injected events are injected inside NestJS context using dependency injection.

## Getting Started

## Testing

docker run --name postgres-container -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgres

yarn prisma:generate --schema=tests/data/ecommerce.schema.prisma

