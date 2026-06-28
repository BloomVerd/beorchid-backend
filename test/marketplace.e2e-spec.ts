/**
 * Marketplace e2e tests — spin up a NestJS testing module with stubbed
 * repositories and verify the full resolver → service → repository chain
 * for the offer state machine via the GraphQL schema.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Listing, ListingStatus } from '../src/modules/marketplace/entities/listing.entity';
import { Offer, OfferStatus } from '../src/modules/marketplace/entities/offer.entity';
import { Deal, DealStatus } from '../src/modules/marketplace/entities/deal.entity';
import { Farm } from '../src/modules/farm/entities/farm.entity';
import { ImageData } from '../src/modules/farm/entities/image-data.entity';
import { FarmHealth } from '../src/modules/health/entities/farm-health.entity';
import { MarketplaceService } from '../src/modules/marketplace/marketplace.service';
import { MarketplaceResolver } from '../src/modules/marketplace/marketplace.resolver';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { NotificationsProducer } from '../src/modules/notifications/notifications.producer';
import { GqlJwtAuthGuard } from '../src/common/guards';
import { RolesGuard } from '../src/modules/roles';

// Shared mock for Guards — bypass JWT auth in e2e tests
const passGuard = { canActivate: () => true };

const makeListingRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn((d: any) => d),
  update: jest.fn(),
});

const makeOfferRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn((d: any) => d),
  update: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  }),
});

const makeDealRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(),
  create: jest.fn((d: any) => d),
});

describe('Marketplace (e2e)', () => {
  let app: INestApplication;
  let listingRepo: ReturnType<typeof makeListingRepo>;
  let offerRepo: ReturnType<typeof makeOfferRepo>;
  let dealRepo: ReturnType<typeof makeDealRepo>;

  const SELLER_ID = 'seller-uuid';
  const BUYER_ID  = 'buyer-uuid';

  beforeAll(async () => {
    listingRepo = makeListingRepo();
    offerRepo   = makeOfferRepo();
    dealRepo    = makeDealRepo();

    const walletService = {
      getOrCreateWallet: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      debit: jest.fn().mockResolvedValue(undefined),
      credit: jest.fn().mockResolvedValue(undefined),
    };

    const notificationsProducer = { notify: jest.fn().mockResolvedValue(undefined) };

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (fn: any) =>
        fn({
          getRepository: (entity: any) => {
            if (entity === Listing) return listingRepo;
            if (entity === Offer)   return offerRepo;
            if (entity === Deal)    return dealRepo;
            return { findOne: jest.fn(), save: jest.fn(), create: jest.fn((d: any) => d) };
          },
        }),
      ),
    };

    const farmRepo       = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
    const imageDataRepo  = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
    const farmHealthRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          context: () => ({
            req: { user: { id: SELLER_ID, roles: ['farmer'], isFieldAgent: false } },
          }),
        }),
      ],
      providers: [
        MarketplaceResolver,
        MarketplaceService,
        { provide: getRepositoryToken(Listing),    useValue: listingRepo    },
        { provide: getRepositoryToken(Offer),      useValue: offerRepo      },
        { provide: getRepositoryToken(Deal),       useValue: dealRepo       },
        { provide: getRepositoryToken(Farm),       useValue: farmRepo       },
        { provide: getRepositoryToken(ImageData),  useValue: imageDataRepo  },
        { provide: getRepositoryToken(FarmHealth), useValue: farmHealthRepo },
        { provide: DataSource,                     useValue: dataSource     },
        { provide: WalletService,        useValue: walletService        },
        { provide: NotificationsProducer, useValue: notificationsProducer },
      ],
    })
      .overrideGuard(GqlJwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(RolesGuard)
      .useValue(passGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  // ── createListing ─────────────────────────────────────────────────────────

  it('createListing returns an OPEN listing', async () => {
    const listing = {
      id: 'listing-1',
      sellerId: SELLER_ID,
      farmId: 'farm-1',
      crop: 'maize',
      region: 'ashanti',
      acreage: 5,
      askingPrice: 200000,
      currency: 'GHS',
      status: ListingStatus.OPEN,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    listingRepo.save.mockResolvedValue(listing);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          createListing(input: {
            farmId: "550e8400-e29b-41d4-a716-446655440000"
            crop: "maize"
            region: "ashanti"
            acreage: 5
            askingPrice: 200000
          }) {
            id status sellerId crop
          }
        }`,
      });

    expect(body.errors).toBeUndefined();
    expect(body.data.createListing.status).toBe('OPEN');
    expect(body.data.createListing.sellerId).toBe(SELLER_ID);
  });

  // ── makeOffer → acceptOffer ───────────────────────────────────────────────

  it('makeOffer transitions listing to UNDER_OFFER', async () => {
    const listing = {
      id: 'listing-1', sellerId: SELLER_ID, status: ListingStatus.OPEN,
      crop: 'maize', region: 'ashanti', acreage: 5, askingPrice: 200000, currency: 'GHS',
      expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const offer = {
      id: 'offer-1', listingId: 'listing-1', buyerId: BUYER_ID,
      amount: 180000, status: OfferStatus.PENDING, message: null, parentOfferId: null,
      expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    listingRepo.findOne.mockResolvedValue(listing);
    offerRepo.save.mockResolvedValue(offer);
    listingRepo.save.mockResolvedValue({ ...listing, status: ListingStatus.UNDER_OFFER });

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          makeOffer(listingId: "listing-1", amount: 180000) {
            id status amount buyerId
          }
        }`,
      });

    expect(body.errors).toBeUndefined();
    expect(body.data.makeOffer.status).toBe('PENDING');
    expect(listingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ListingStatus.UNDER_OFFER }),
    );
  });

  it('acceptOffer returns a deal with IN_ESCROW status', async () => {
    const offer = {
      id: 'offer-1', listingId: 'listing-1', buyerId: BUYER_ID,
      amount: 180000, status: OfferStatus.PENDING,
    };
    const listing = {
      id: 'listing-1', sellerId: SELLER_ID, status: ListingStatus.UNDER_OFFER, askingPrice: 200000,
    };
    const deal = {
      id: 'deal-1', listingId: 'listing-1', acceptedOfferId: 'offer-1',
      sellerId: SELLER_ID, buyerId: BUYER_ID, amount: 180000,
      status: DealStatus.IN_ESCROW, escrowLedgerRef: 'txn-abc',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    offerRepo.findOne.mockResolvedValue(offer);
    listingRepo.findOne.mockResolvedValue(listing);
    offerRepo.save.mockResolvedValue({ ...offer, status: OfferStatus.ACCEPTED });
    listingRepo.save.mockResolvedValue({ ...listing, status: ListingStatus.ACCEPTED });
    dealRepo.save.mockResolvedValue(deal);

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation {
          acceptOffer(offerId: "offer-1") {
            id status amount sellerId buyerId
          }
        }`,
      });

    expect(body.errors).toBeUndefined();
    expect(body.data.acceptOffer.status).toBe('IN_ESCROW');
    expect(body.data.acceptOffer.amount).toBe(180000);
  });

  // ── withdrawOffer ─────────────────────────────────────────────────────────

  it('withdrawOffer returns WITHDRAWN status', async () => {
    const offer = {
      id: 'offer-1', listingId: 'listing-1', buyerId: SELLER_ID,
      amount: 180000, status: OfferStatus.PENDING, message: null, parentOfferId: null,
      expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    offerRepo.findOne.mockResolvedValue(offer);
    offerRepo.save.mockResolvedValue({ ...offer, status: OfferStatus.WITHDRAWN });

    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `mutation { withdrawOffer(offerId: "offer-1") { id status } }` });

    expect(body.errors).toBeUndefined();
    expect(body.data.withdrawOffer.status).toBe('WITHDRAWN');
  });

  // ── listings query ────────────────────────────────────────────────────────

  it('listings query returns empty array when no listings exist', async () => {
    listingRepo.find.mockResolvedValue([]);
    const { body } = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `{ listings { id } }` });

    expect(body.errors).toBeUndefined();
    expect(body.data.listings).toEqual([]);
  });
});
