import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Chat } from './entities/chat.entity';
import { PaginatedChats } from './types/chat.types';
import { GqlJwtAuthGuard } from 'src/common/guards';
import { CurrentFarmer } from 'src/common/decorators';
import { Farmer } from '../farmer/entities/farmer.entity';

/**
 * GraphQL resolver for the chat module. Exposes the paginated chat-list query.
 * Message sending and SSE streaming are handled by the REST controller because
 * GraphQL subscriptions add complexity that isn't needed here — SSE over HTTP
 * is simpler and browser-native.
 */
@Resolver(() => Chat)
export class ChatResolver {
  constructor(private readonly chatService: ChatService) {}

  /** Returns a paginated list of the authenticated farmer's chat threads ordered by last update. */
  @Query(() => PaginatedChats)
  @UseGuards(GqlJwtAuthGuard)
  getChats(
    @Args('page', { type: () => Int, defaultValue: 1 }) page: number,
    @Args('limit', { type: () => Int, defaultValue: 20 }) limit: number,
    @CurrentFarmer() farmer: Farmer,
  ) {
    return this.chatService.getChats(farmer.id, page, limit);
  }
}
