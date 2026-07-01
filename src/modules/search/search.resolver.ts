import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchResults } from './types/search-results.type';
import { GqlJwtAuthGuard } from 'src/common/guards';

/**
 * GraphQL resolver for cross-entity search. Requires a valid JWT. Returns a
 * `SearchResults` object containing matched listings, coins, investment plans,
 * and crops. Queries shorter than 2 characters return empty arrays.
 */
@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class SearchResolver {
  constructor(private readonly searchService: SearchService) {}

  /**
   * Searches listings, coins, investment plans, and crops for the given query
   * string. Results per entity type are capped at `min(limit, 20)`.
   */
  @Query(() => SearchResults)
  search(
    @Args('query') query: string,
    @Args('limit', { nullable: true, type: () => Int }) limit = 5,
  ): Promise<SearchResults> {
    return this.searchService.search(query, limit);
  }
}
