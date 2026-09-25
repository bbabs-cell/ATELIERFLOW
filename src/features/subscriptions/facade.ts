import type { SubscriptionService } from "@/application/subscriptions/subscriptionService";
import { createSubscriptionService } from "@/application/subscriptions/subscriptionService";
import { defaultSubscription } from "@/domain/subscriptions/plans";
import type { SubscriptionMirror } from "@/domain/subscriptions/plans";
import { makeLocalCustomersRepository } from "@/repository/local/clients";
import { createIndexedDbCache } from "@/repository/local/indexeddb/cache";
import { makeLocalOrdersRepository } from "@/repository/local/orders";
import { makeLocalTeamRepository } from "@/repository/local/team";
import {
  SUBSCRIPTIONS_DEMO_PROFILE_ID,
  SUBSCRIPTIONS_DEMO_TENANT_ID,
} from "./constants";

export interface SubscriptionsFacade {
  subscriptions: SubscriptionService;
}

export function createSubscriptionsFacade(input: {
  tenantId: string;
  profileId: string;
}): SubscriptionsFacade {
  const cache = createIndexedDbCache(input.tenantId);

  const subscriptions = createSubscriptionService({
    profileId: input.profileId,
    customers: makeLocalCustomersRepository(cache),
    orders: makeLocalOrdersRepository(cache),
    team: makeLocalTeamRepository(cache),
    loadSubscription: async (): Promise<SubscriptionMirror | null> => {
      const record = (await cache.get("subscriptions", input.tenantId)) as
        | SubscriptionMirror
        | null
        | undefined;
      return record ?? defaultSubscription();
    },
  });

  return { subscriptions };
}

let singleton: SubscriptionsFacade | null = null;

export function getSubscriptionsFacade(): SubscriptionsFacade {
  if (typeof window === "undefined") {
    throw new Error("SUBSCRIPTIONS_FACADE_SERVER_SIDE");
  }
  if (singleton === null) {
    singleton = createSubscriptionsFacade({
      tenantId: SUBSCRIPTIONS_DEMO_TENANT_ID,
      profileId: SUBSCRIPTIONS_DEMO_PROFILE_ID,
    });
  }
  return singleton;
}