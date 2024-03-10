export const ecommerceDatamodel = `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
    id          Int      @id @default(autoincrement())
    username    String
    email       String   @unique
    password    String
    phoneNumber String?
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    orders      Order[]
}

model Order {
    id           Int       @id @default(autoincrement())
    createdAt    DateTime  @default(now())
    totalPrice   Float
    status       String
    shippingInfo String?
    userId       Int
    user         User      @relation(fields: [userId], references: [id])
    products     Product[]
}

model Offer {
    id          Int      @id @default(autoincrement())
    name        String
    description String?
    discount    Float
    startDate   DateTime
    endDate     DateTime
    product     Product  @relation(fields: [productId], references: [id])
    productId   Int
}

model Product {
    id          Int      @id @default(autoincrement())
    name        String
    description String?
    price       Float
    stock       Int
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    orders      Order[]
    offers      Offer[]
}
`