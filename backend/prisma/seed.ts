import { PrismaClient, AssetType } from '@prisma/client';
import { UNIVERSE } from '../src/lib/universe.js';

const prisma = new PrismaClient();

async function main() {
  for (const item of UNIVERSE) {
    await prisma.security.upsert({
      where: { ticker: item.ticker },
      create: {
        ticker: item.ticker,
        yahooSymbol: item.yahooSymbol,
        name: item.name,
        exchange: item.exchange,
        sector: item.sector,
        assetType: item.assetType as AssetType,
        currency: item.currency,
        country: item.country,
        active: true,
      },
      update: {
        yahooSymbol: item.yahooSymbol,
        name: item.name,
        exchange: item.exchange,
        sector: item.sector,
        assetType: item.assetType as AssetType,
        currency: item.currency,
        country: item.country,
        active: true,
      },
    });
  }
  console.log(`Seeded ${UNIVERSE.length} securities (metadata only; quotes come from Yahoo Finance).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
