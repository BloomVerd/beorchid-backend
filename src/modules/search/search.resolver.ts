import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchResults } from './types/search-results.type';
import { GqlJwtAuthGuard } from 'src/common/guards';

@Resolver()
@UseGuards(GqlJwtAuthGuard)
export class SearchResolver {
  constructor(private readonly searchService: SearchService) {}

  @Query(() => SearchResults)
  search(
    @Args('query') query: string,
    @Args('limit', { nullable: true, type: () => Int }) limit = 5,
  ): Promise<SearchResults> {
    return this.searchService.search(query, limit);
  }
}
