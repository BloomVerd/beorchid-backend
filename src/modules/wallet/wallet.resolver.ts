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

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class WalletResolver {
  constructor(private readonly walletService: WalletService) {}

  @Query(() => Wallet)
  async myWallet(@CurrentFarmer() user: Farmer): Promise<Wallet> {
    return this.walletService.getOrCreateWallet(user.id);
  }

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

  @Mutation(() => DepositResult)
  async initiateDeposit(
    @Args('input') input: InitiateDepositInput,
    @CurrentFarmer() user: Farmer,
  ): Promise<DepositResult> {
    return this.walletService.initiateDeposit(user.id, input.amountPesewas, input.idempotencyKey);
  }
}
