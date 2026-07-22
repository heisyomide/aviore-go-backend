import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });



interface LandmarkSeed {
  name: string;
  aliases: string[];
  description: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

const OSOGBO_LANDMARKS: LandmarkSeed[] = [
  // ==================== MAJOR AREAS & JUNCTIONS ====================
  {
    name: 'Old Garage',
    aliases: ['old garage', 'garage', 'station road'],
    description: 'Station Road, Old Garage Bus Stop & Roundabout',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7719,
    longitude: 4.5581,
  },
  {
    name: 'New Garage',
    aliases: ['new garage', 'motor park'],
    description: 'Ikirun Road, New Garage Park',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7912,
    longitude: 4.5682,
  },
  {
    name: 'Oke-Fia Roundabout',
    aliases: ['okefia', 'oke fia', 'oke fia junction'],
    description: 'Oke-Fia Roundabout, connecting Alekuwodo & Lameco',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7788,
    longitude: 4.5458,
  },
  {
    name: 'Alekuwodo Junction',
    aliases: ['alekuwodo', 'akindeko'],
    description: 'Alekuwodo Area / Akindeko Junction',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.772,
    longitude: 4.549,
  },
  {
    name: 'Ogo-Oluwa Area',
    aliases: ['ogo oluwa', 'ogooluwa'],
    description: 'Gbongan-Osogbo Express Road, Ogo-Oluwa',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7512,
    longitude: 4.5752,
  },
  {
    name: 'Aregbe Bus Stop',
    aliases: ['aregbe', 'aregbe junction'],
    description: 'Along Gbongan-Osogbo Express Road',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7583,
    longitude: 4.5694,
  },
  {
    name: 'Olaiya Flyover',
    aliases: ['olaiya', 'olaiya junction'],
    description: 'Central Olaiya Flyover Bridge Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7695,
    longitude: 4.5539,
  },
  {
    name: 'Ring Road',
    aliases: ['ring road', 'bypass'],
    description: 'Osogbo Ring Road Bypass Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7811,
    longitude: 4.531,
  },
  {
    name: 'Lameco Roundabout',
    aliases: ['lameco', 'lameco junction'],
    description: 'Ring Road / Lameco Junction',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.789,
    longitude: 4.532,
  },
  {
    name: 'Oke Baale',
    aliases: ['oke baale', 'okebaale'],
    description: 'Oke Baale Area, leading to UNIOSUN',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7642,
    longitude: 4.5821,
  },
  {
    name: 'Oke Onitea',
    aliases: ['oke onitea', 'onitea'],
    description: 'Oke Onitea Area, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7981,
    longitude: 4.5412,
  },
  {
    name: 'Dada Estate',
    aliases: ['dada estate'],
    description: 'Dada Estate Residential Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.745,
    longitude: 4.538,
  },
  {
    name: 'GRA Osogbo',
    aliases: ['gra', 'government reservation area'],
    description: 'GRA Residential Zone, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7621,
    longitude: 4.5612,
  },
  {
    name: 'Powerline Area',
    aliases: ['powerline', 'power line'],
    description: 'Powerline Bus Stop / Zone',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7481,
    longitude: 4.5689,
  },
  {
    name: 'Testing Ground',
    aliases: ['testing ground'],
    description: 'Testing Ground Area, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.785,
    longitude: 4.562,
  },
  {
    name: 'Station Road',
    aliases: ['station road', 'railway station'],
    description: 'Station Road Commercial Belt',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7702,
    longitude: 4.5561,
  },
  {
    name: 'Osogbo Stadium Area',
    aliases: ['stadium', 'osogbo stadium'],
    description: 'Osogbo Township Stadium Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7751,
    longitude: 4.562,
  },
  {
    name: 'Abere State Secretariat',
    aliases: ['abere', 'secretariat', 'governor office'],
    description: 'Osun State Secretariat Complex, Abere',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7214,
    longitude: 4.5401,
  },
  {
    name: 'Ofatedo',
    aliases: ['ofatedo'],
    description: 'Ofatedo Town / Osogbo Boundary',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7312,
    longitude: 4.5201,
  },
  {
    name: 'Kobongbogboe',
    aliases: ['kobongbogboe', 'kobo'],
    description: 'Kobongbogboe Area, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.8012,
    longitude: 4.5512,
  },
  {
    name: 'Oke Ayepe',
    aliases: ['oke ayepe', 'ayepe'],
    description: 'Oke Ayepe Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7551,
    longitude: 4.5891,
  },
  {
    name: 'Oroki Estate',
    aliases: ['oroki estate', 'oroki'],
    description: 'Oroki Housing Estate',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7812,
    longitude: 4.5381,
  },
  {
    name: 'Ota Efun',
    aliases: ['ota efun', 'otaefun'],
    description: 'Ota Efun Junction & Market Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.8102,
    longitude: 4.5712,
  },
  {
    name: 'Isale Osun',
    aliases: ['isale osun'],
    description: 'Isale Osun Heritage Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7591,
    longitude: 4.5612,
  },
  {
    name: 'Ayetoro',
    aliases: ['ayetoro'],
    description: 'Ayetoro Junction & Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7841,
    longitude: 4.5511,
  },
  {
    name: 'Sabo Area',
    aliases: ['sabo', 'sabo market'],
    description: 'Sabo Commercial Belt',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7812,
    longitude: 4.5712,
  },
  {
    name: 'Jaleyemi',
    aliases: ['jaleyemi'],
    description: 'Jaleyemi Hospital / Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7681,
    longitude: 4.5619,
  },
  {
    name: 'Fiwasaye',
    aliases: ['fiwasaye'],
    description: 'Fiwasaye Area, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7612,
    longitude: 4.5412,
  },
  {
    name: 'Igbona',
    aliases: ['igbona', 'igbonna'],
    description: 'Igbona Market & Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7781,
    longitude: 4.5612,
  },
  {
    name: 'Biket Junction (Ikirun Road)',
    aliases: ['biket', 'biket hospital'],
    description: 'Ikirun Road, Biket Junction',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7941,
    longitude: 4.5639,
  },

  // ==================== MARKETS ====================
  {
    name: 'Oja Oba Market',
    aliases: ['oja oba', 'palace market'],
    description: 'Oja Oba Central Market & Ataoja Palace',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7661,
    longitude: 4.5618,
  },
  {
    name: 'Orisunbare Market',
    aliases: ['orisunbare', 'orisunbare market'],
    description: 'Orisunbare Main Market, Old Garage',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7709,
    longitude: 4.5571,
  },
  {
    name: 'Alekuwodo Market',
    aliases: ['alekuwodo market'],
    description: 'Alekuwodo Food & Retail Market',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7715,
    longitude: 4.5481,
  },

  // ==================== HOSPITALS ====================
  {
    name: 'UNIOSUN Teaching Hospital',
    aliases: ['uth', 'lautech teaching hospital', 'lautech hospital'],
    description: 'UNIOSUN Teaching Hospital (formerly LAUTECH TH)',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7812,
    longitude: 4.5491,
  },
  {
    name: 'Osun State Specialist Hospital (Asubiaro)',
    aliases: ['asubiaro', 'state hospital'],
    description: 'Asubiaro State Hospital Complex',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7551,
    longitude: 4.5512,
  },
  {
    name: 'Living Hope Hospital',
    aliases: ['living hope'],
    description: 'Living Hope Hospital, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7689,
    longitude: 4.5421,
  },

  // ==================== SCHOOLS ====================
  {
    name: 'UNIOSUN Main Campus',
    aliases: ['uniosun', 'osun state university'],
    description: 'Oke Baale, UNIOSUN Main Campus Gate',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.761,
    longitude: 4.6011,
  },
  {
    name: 'Osogbo Grammar School',
    aliases: ['osogbo grammar school', 'grammar school'],
    description: 'Osogbo Grammar School Grounds',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7741,
    longitude: 4.5521,
  },
  {
    name: 'Ataoja School of Science',
    aliases: ['ataoja science', 'school of science'],
    description: 'Ataoja Government School of Science',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7512,
    longitude: 4.5612,
  },

  // ==================== GOVERNMENT OFFICES ====================
  {
    name: 'Government House Osogbo',
    aliases: ['government house', 'okefia government house'],
    description: 'Government House, Oke-Fia',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7812,
    longitude: 4.5412,
  },
  {
    name: 'High Court Osogbo',
    aliases: ['high court', 'court'],
    description: 'Osun State High Court Complex',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7721,
    longitude: 4.5512,
  },
  {
    name: 'Federal Secretariat',
    aliases: ['federal secretariat'],
    description: 'Federal Secretariat Complex, Osogbo',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7312,
    longitude: 4.5481,
  },

  // ==================== BANKS & HOTELS ====================
  {
    name: 'GTBank Oke-Fia',
    aliases: ['gtbank okefia', 'gtb okefia'],
    description: 'Guaranty Trust Bank, Oke-Fia Branch',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7779,
    longitude: 4.5461,
  },
  {
    name: 'First Bank Oke-Fia',
    aliases: ['first bank okefia'],
    description: 'First Bank of Nigeria, Oke-Fia Branch',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7782,
    longitude: 4.5451,
  },
  {
    name: 'Access Bank Gbongan Road',
    aliases: ['access bank ogooluwa', 'access bank'],
    description: 'Access Bank, Ogo-Oluwa / Gbongan Road',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7521,
    longitude: 4.5721,
  },
  {
    name: 'Atlantis Grand Suites',
    aliases: ['atlantis', 'atlantis hotel'],
    description: 'Atlantis Hotel & Suites, Ring Road',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7812,
    longitude: 4.5291,
  },
  {
    name: 'Ideal Nest Hotel',
    aliases: ['ideal nest'],
    description: 'Ideal Nest Hotel, Oroki Estate Area',
    city: 'Osogbo',
    state: 'Osun',
    latitude: 7.7831,
    longitude: 4.5361,
  },
];

async function main() {
  console.log('🌱 Seeding Osogbo landmarks...');

  for (const item of OSOGBO_LANDMARKS) {
    const slug = `osogbo-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    await prisma.landmark.upsert({
      where: { id: slug },
      update: item,
      create: {
        id: slug,
        ...item,
      },
    });
  }

  console.log(`✅ Successfully seeded ${OSOGBO_LANDMARKS.length} Osogbo landmarks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });