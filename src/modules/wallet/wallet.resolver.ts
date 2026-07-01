import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { LedgerEntry, LedgerAccount } from './entities/ledger-entry.entity';
import { InitiateDepositInput } from './inputs/initiate-deposit.input';
import { DepositResult } from './types/deposit-result.type';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for wallet operations. All queries and mutations require a
 * valid JWT (`GqlJwtAuthGuard` applied at the class level). All operations are
 * scoped to the authenticated user — there are no admin-level wallet overrides
 * exposed here.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class WalletResolver {
  constructor(private readonly walletService: WalletService) {}

  /** Returns the authenticated user's wallet, creating it lazily if necessary. */
  @Query(() => Wallet)
  async myWallet(@CurrentFarmer() user: Farmer): Promise<Wallet> {
    return this.walletService.getOrCreateWallet(user.id);
  }

  /**
   * Returns ledger entries for the authenticated user's wallet with optional
   * date-range and account-type filters. Results are newest-first.
   */
  @Query(() => [LedgerEntry])
  async myLedger(
    @CurrentFarmer() user: Farmer,
    @Args('from', { nullable: true }) from?: Date,
    @Args('to', { nullable: true }) to?: Date,
    @Args('account', { nullable: true, type: () => LedgerAccount }) account?: LedgerAccount,
  ): Promise<LedgerEntry[]> {
    const wallet = await this.walletService.getOrCreateWallet(user.id);
    return this.walletService.getLedger(wallet.id, from, to, account);
  }

  /**
   * Initiates a Paystack deposit for the authenticated user. Returns the
   * Paystack checkout URL and the created payment intent. Idempotent on
   * `idempotencyKey`.
   */
  @Mutation(() => DepositResult)
  async initiateDeposit(
    @Args('input') input: InitiateDepositInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<DepositResult> {
    return this.walletService.initiateDeposit(user.id, input.amountPesewas, input.idempotencyKey);
  }
}
