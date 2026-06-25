import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { Listing, ListingStatus } from './entities/listing.entity';
import { Offer, OfferStatus } from './entities/offer.entity';
import { Deal, DealStatus } from './entities/deal.entity';
import { WalletService } from '../wallet/wallet.service';
import { LedgerAccount } from '../wallet/entities/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';

const makeRepo = (overrides: Partial<any> = {}) => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
  update: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  }),
  ...overrides,
});

const makeListing = (overrides: Partial<Listing> = {}): Listing =>
  ({
    id: 'listing-1',
    sellerId: 'seller-1',
    farmId: 'farm-1',
    crop: 'maize',
    region: 'ashanti',
    acreage: 5,
    askingPrice: 200000,
    currency: 'GHS',
    status: ListingStatus.OPEN,
    expiresAt: new Date(Date.now() + 90 * 86400 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Listing);

const makeOffer = (overrides: Partial<Offer> = {}): Offer =>
  ({
    id: 'offer-1',
    listingId: 'listing-1',
    buyerId: 'buyer-1',
    amount: 180000,
    message: null,
    status: OfferStatus.PENDING,
    parentOfferId: null,
    expiresAt: new Date(Date.now() + 7 * 86400 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Offer);

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let listingRepo: ReturnType<typeof makeRepo>;
  let offerRepo: ReturnType<typeof makeRepo>;
  let dealRepo: ReturnType<typeof makeRepo>;
  let walletService: { getOrCreateWallet: jest.Mock; debit: jest.Mock; credit: jest.Mock };
  let notificationsService: { create: jest.Mock };
  let dataSource: any;

  beforeEach(async () => {
    listingRepo  = makeRepo();
    offerRepo    = makeRepo();
    dealRepo     = makeRepo();
    walletService      = { getOrCreateWallet: jest.fn(), debit: jest.fn(), credit: jest.fn() };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (fn: (em: any) => Promise<any>) => {
        const em = {
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === Listing) return listingRepo;
            if (entity === Offer)   return offerRepo;
            if (entity === Deal)    return dealRepo;
            return makeRepo();
          }),
        };
        return fn(em);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: getRepositoryToken(Listing), useValue: listingRepo },
        { provide: getRepositoryToken(Offer),   useValue: offerRepo   },
        { provide: getRepositoryToken(Deal),    useValue: dealRepo    },
        { provide: DataSource,                  useValue: dataSource  },
        { provide: WalletService,        useValue: walletService        },
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createListing ──────────────────────────────────────────────────────────

  describe('createListing', () => {
    it('creates a listing with OPEN status', async () => {
      const listing = makeListing();
      listingRepo.save.mockResolvedValue(listing);

      const result = await service.createListing(
        { crop: 'maize', region: 'ashanti', acreage: 5, askingPrice: 200000, currency: 'GHS', farmId: 'farm-1' } as any,
        'seller-1',
      );

      expect(listingRepo.save).toHaveBeenCalled();
      expect(result.status).toBe(ListingStatus.OPEN);
    });
  });

  // ── makeOffer ──────────────────────────────────────────────────────────────

  describe('makeOffer', () => {
    it('creates a PENDING offer and transitions listing to UNDER_OFFER', async () => {
      const listing = makeListing({ status: ListingStatus.OPEN });
      listingRepo.findOne.mockResolvedValue(listing);
      const offer = makeOffer();
      offerRepo.save.mockResolvedValue(offer);
      listingRepo.save.mockResolvedValue({ ...listing, status: ListingStatus.UNDER_OFFER });

      const result = await service.makeOffer('listing-1', 'buyer-1', 180000);

      expect(result.status).toBe(OfferStatus.PENDING);
      expect(listingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ListingStatus.UNDER_OFFER }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith('seller-1', expect.any(Object));
    });

    it('throws BadRequestException on a WITHDRAWN listing', async () => {
      listingRepo.findOne.mockResolvedValue(makeListing({ status: ListingStatus.WITHDRAWN }));
      await expect(service.makeOffer('listing-1', 'buyer-1', 100)).rejects.toThrow(BadRequestException);
    });
  });

  // ── withdrawListing ───────────────────────────────────────────────────────

  describe('withdrawListing', () => {
    it('sets listing status to WITHDRAWN', async () => {
      const listing = makeListing({ sellerId: 'seller-1' });
      listingRepo.findOne.mockResolvedValue(listing);
      listingRepo.save.mockResolvedValue({ ...listing, status: ListingStatus.WITHDRAWN });

      const result = await service.withdrawListing('listing-1', 'seller-1');
      expect(result.status).toBe(ListingStatus.WITHDRAWN);
    });

    it('throws ForbiddenException when caller is not the seller', async () => {
      listingRepo.findOne.mockResolvedValue(makeListing({ sellerId: 'seller-1' }));
      await expect(service.withdrawListing('listing-1', 'impostor')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── acceptOffer — state machine ────────────────────────────────────────────

  describe('acceptOffer', () => {
    const setupAccept = () => {
      const offer   = makeOffer({ status: OfferStatus.PENDING });
      const listing = makeListing({ status: ListingStatus.UNDER_OFFER });
      offerRepo.findOne.mockResolvedValue(offer);
      listingRepo.findOne.mockResolvedValue(listing);
      offerRepo.save.mockResolvedValue({ ...offer, status: OfferStatus.ACCEPTED });
      listingRepo.save.mockResolvedValue({ ...listing, status: ListingStatus.ACCEPTED });
      walletService.getOrCreateWallet.mockResolvedValue({ id: 'wallet-buyer' });
      walletService.debit.mockResolvedValue(undefined);
      const deal = { id: 'deal-1', status: DealStatus.IN_ESCROW };
      dealRepo.save.mockResolvedValue(deal);
      return { offer, listing, deal };
    };

    it('accepts offer, moves listing to ACCEPTED, creates Deal IN_ESCROW', async () => {
      const { deal } = setupAccept();
      const result = await service.acceptOffer('offer-1', 'seller-1');
      expect(result).toEqual(deal);
      expect(dealRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: DealStatus.IN_ESCROW }),
      );
    });

    it('debits buyer wallet into ESCROW with correct amount', async () => {
      setupAccept();
      await service.acceptOffer('offer-1', 'seller-1');
      expect(walletService.debit).toHaveBeenCalledWith(
        'wallet-buyer', 180000, LedgerAccount.ESCROW, expect.any(String), expect.anything(),
      );
    });

    it('auto-rejects other pending offers on the same listing', async () => {
      setupAccept();
      await service.acceptOffer('offer-1', 'seller-1');
      const qb = offerRepo.createQueryBuilder();
      expect(qb.update).toHaveBeenCalled();
      expect(qb.set).toHaveBeenCalledWith({ status: OfferStatus.REJECTED });
    });

    it('notifies both buyer and seller', async () => {
      setupAccept();
      await service.acceptOffer('offer-1', 'seller-1');
      expect(notificationsService.create).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when offer is not PENDING', async () => {
      const offer = makeOffer({ status: OfferStatus.ACCEPTED });
      offerRepo.findOne.mockResolvedValue(offer);
      listingRepo.findOne.mockResolvedValue(makeListing());
      await expect(service.acceptOffer('offer-1', 'seller-1')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when caller is neither buyer nor seller', async () => {
      offerRepo.findOne.mockResolvedValue(makeOffer({ buyerId: 'buyer-1' }));
      listingRepo.findOne.mockResolvedValue(makeListing({ sellerId: 'seller-1' }));
      await expect(service.acceptOffer('offer-1', 'impostor')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── rejectOffer ───────────────────────────────────────────────────────────

  describe('rejectOffer', () => {
    it('marks offer REJECTED and notifies buyer', async () => {
      const offer   = makeOffer({ status: OfferStatus.PENDING, buyerId: 'buyer-1' });
      const listing = makeListing({ sellerId: 'seller-1' });
      offerRepo.findOne.mockResolvedValue(offer);
      listingRepo.findOne.mockResolvedValue(listing);
      offerRepo.save.mockResolvedValue({ ...offer, status: OfferStatus.REJECTED });

      const result = await service.rejectOffer('offer-1', 'seller-1');
      expect(result.status).toBe(OfferStatus.REJECTED);
      expect(notificationsService.create).toHaveBeenCalledWith('buyer-1', expect.any(Object));
    });
  });

  // ── withdrawOffer ─────────────────────────────────────────────────────────

  describe('withdrawOffer', () => {
    it('marks offer WITHDRAWN', async () => {
      const offer = makeOffer({ status: OfferStatus.PENDING, buyerId: 'buyer-1' });
      offerRepo.findOne.mockResolvedValue(offer);
      offerRepo.save.mockResolvedValue({ ...offer, status: OfferStatus.WITHDRAWN });

      const result = await service.withdrawOffer('offer-1', 'buyer-1');
      expect(result.status).toBe(OfferStatus.WITHDRAWN);
    });

    it('throws BadRequestException when withdrawing a non-PENDING offer', async () => {
      offerRepo.findOne.mockResolvedValue(makeOffer({ status: OfferStatus.ACCEPTED, buyerId: 'buyer-1' }));
      await expect(service.withdrawOffer('offer-1', 'buyer-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── confirmDealPayment ────────────────────────────────────────────────────

  describe('confirmDealPayment', () => {
    it('marks deal COMPLETED and credits seller wallet', async () => {
      const deal = {
        id: 'deal-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        amount: 180000,
        status: DealStatus.IN_ESCROW,
      } as Deal;
      dealRepo.findOne.mockResolvedValue(deal);
      dealRepo.save.mockResolvedValue({ ...deal, status: DealStatus.COMPLETED });
      walletService.getOrCreateWallet.mockResolvedValue({ id: 'wallet-seller' });
      walletService.credit.mockResolvedValue(undefined);

      const result = await service.confirmDealPayment('deal-1', 'buyer-1');

      expect(result.status).toBe(DealStatus.COMPLETED);
      expect(walletService.credit).toHaveBeenCalledWith(
        'wallet-seller', 180000, LedgerAccount.USER_CASH, expect.any(String),
      );
    });
  });
});
