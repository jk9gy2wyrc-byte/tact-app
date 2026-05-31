export type SubscriptionPlanTier = {
  months: number;
  price: number;
};

export type SubscriptionPlans = {
  firstPurchase: {
    freeWeeks: number;
    monthlyPrice: number;
  };
  monthlyPlans: SubscriptionPlanTier[];
};

export type SubscriptionSettingsPayload = {
  buttonText: string;
  buttonUrl: string;
  plans: SubscriptionPlans;
};

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlans = {
  firstPurchase: { freeWeeks: 1, monthlyPrice: 10 },
  monthlyPlans: [
    { months: 1, price: 10 },
    { months: 3, price: 25 },
    { months: 6, price: 45 },
    { months: 12, price: 80 },
  ],
};

export const DEFAULT_SUBSCRIPTION_SETTINGS: SubscriptionSettingsPayload = {
  buttonText: "Contact Us",
  buttonUrl: "",
  plans: DEFAULT_SUBSCRIPTION_PLANS,
};
