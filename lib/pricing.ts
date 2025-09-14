export interface PricingTier {
  id: 'free' | 'starter' | 'pro';
  name: string;
  price: {
    monthly: number;
    yearly: number;
  };
  limits: {
    maxPersonas: number;
    maxPrivatePersonas: number;
    messageLimitPerWeek: number;
    storageLimitGB: number;
  };
  features: string[];
  popular?: boolean;
}

export const PRICING_TIERS: Record<string, PricingTier> = {
  free: {
    id: 'free',
    name: 'Free',
    price: {
      monthly: 0,
      yearly: 0,
    },
    limits: {
      maxPersonas: 0, // No persona creation
      maxPrivatePersonas: 0,
      messageLimitPerWeek: 50,
      storageLimitGB: 0,
    },
    features: [
      'Chat with public personas',
      '50 messages per week',
      'Basic support',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: {
      monthly: 7,
      yearly: 60, // $5/month when billed yearly
    },
    limits: {
      maxPersonas: 5,
      maxPrivatePersonas: 2,
      messageLimitPerWeek: 2000,
      storageLimitGB: 1,
    },
    features: [
      'Create up to 5 personas',
      '2 private personas',
      '2,000 messages per month',
      '1GB storage per persona',
      'Priority support',
    ],
    popular: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: {
      monthly: 14,
      yearly: 120, // $10/month when billed yearly
    },
    limits: {
      maxPersonas: 15,
      maxPrivatePersonas: 15,
      messageLimitPerWeek: 5000,
      storageLimitGB: 1,
    },
    features: [
      'Create up to 15 personas',
      'All personas can be private',
      '5,000 messages per month',
      '1GB storage per persona',
      'Premium support',
      'Advanced analytics',
    ],
  },
};

export function getPlanLimits(planId: string): PricingTier['limits'] {
  return PRICING_TIERS[planId]?.limits || PRICING_TIERS.free.limits;
}

export function getPlanInfo(planId: string): PricingTier {
  return PRICING_TIERS[planId] || PRICING_TIERS.free;
}