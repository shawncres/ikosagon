export type CustomerRecord = {
  accountId: string;
  name: string;
  createdAt: string;
  notes: Record<string, unknown>;
  balance: number;
  currency: string;
  status: string;
  planEligible: boolean;
  lastPayment?: string | null;
  productInterest?: string[];
};

export type CreateCustomerInput = {
  name: string;
  notes?: Record<string, unknown>;
};
