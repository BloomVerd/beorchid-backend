import { GraphQLError } from 'graphql';

export function throwSubscriptionLimitError(
  message: string,
  limitType: 'maxFarms' | 'predictionWeeklyLimit',
  currentPlan?: string,
): never {
  throw new GraphQLError(message, {
    extensions: {
      code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
      limitType,
      ...(currentPlan && { currentPlan }),
    },
  });
}

export function throwPlanUpgradeRequired(
  currentPlan: string,
  requiredPlan: string,
): never {
  throw new GraphQLError(
    `This feature requires the ${requiredPlan} plan or higher`,
    {
      extensions: {
        code: 'PLAN_UPGRADE_REQUIRED',
        currentPlan,
        requiredPlan,
      },
    },
  );
}
