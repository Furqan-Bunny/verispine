import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface AdminAffiliateRow {
  id: string;
  name: string;
  email: string | null;
  kycStatus: string;
  affiliateActivatedAt: any;
  balance: number;
  pendingBalance: number;
  referredUsersCount: number;
  referralPurchases: number;
  grossReferralSales: number;
  totalEarned: number;
  pendingCommission: number;
  owedFromReversals: number;
}

export interface AdminAffiliateTotals {
  totalPaidOut: number;
  totalPending: number;
  totalReferralSales: number;
  totalReferredUsers: number;
  totalOwed: number;
  affiliateCount: number;
}

export interface AdminAffiliateListResponse {
  success: boolean;
  data: AdminAffiliateRow[];
  totals: AdminAffiliateTotals;
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminAffiliateDetail extends AdminAffiliateRow {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  createdAt: any;
  lastLoginAt: any;
  isAffiliate: boolean;
  totalReferrals: number;
}

export interface AdminAffiliateReferral {
  userId: string;
  name: string;
  email: string | null;
  signupDate: any;
  type: 'invite' | 'direct';
  purchaseCount: number;
  totalSpent: number;
  commissionGenerated: number;
}

export interface AdminAffiliateCommission {
  id: string;
  orderId: string | null;
  referredUserId: string | null;
  purchaseAmount: number;
  commissionAmount: number;
  status: 'pending' | 'credited' | 'reversed';
  createdAt: any;
  releasedAt: any;
  reversedAt: any;
}

export interface AdminAffiliateTimeseriesPoint {
  date: string;
  commission: number;
  released: number;
}

export interface AdminAffiliateTimeseriesTotals {
  commission: number;
  released: number;
  earned: number;
  pending: number;
  referredUsers: number;
  referralPurchases: number;
  grossReferralSales: number;
}

export interface AdminAffiliateTimeseriesResponse {
  success: boolean;
  data: {
    period: string;
    startDate: string;
    endDate?: string;
    series: AdminAffiliateTimeseriesPoint[];
    totals: AdminAffiliateTimeseriesTotals;
  };
}

export interface AdminAffiliateActivityEvent {
  type: string;
  title: string;
  detail: string | null;
  timestamp: string;
}

export interface AdminListAffiliatesParams {
  search?: string;
  sortBy?: 'earnings' | 'pending' | 'referrals' | 'sales' | 'activated';
  page?: number;
  limit?: number;
}

export const listAdminAffiliates = async (
  params: AdminListAffiliatesParams = {}
): Promise<AdminAffiliateListResponse> => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const response = await axios.get(`${API_URL}/admin/affiliates?${qs.toString()}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminAffiliateDetail = async (
  id: string
): Promise<{ success: boolean; data: AdminAffiliateDetail }> => {
  const response = await axios.get(`${API_URL}/admin/affiliates/${id}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminAffiliateReferrals = async (
  id: string
): Promise<{ success: boolean; data: AdminAffiliateReferral[] }> => {
  const response = await axios.get(`${API_URL}/admin/affiliates/${id}/referrals`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminAffiliateCommissions = async (
  id: string
): Promise<{ success: boolean; data: AdminAffiliateCommission[] }> => {
  const response = await axios.get(`${API_URL}/admin/affiliates/${id}/commissions`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminAffiliateTimeseries = async (
  id: string,
  period: '7d' | '30d' | '90d' | '1y' = '30d',
  from?: string,
  to?: string
): Promise<AdminAffiliateTimeseriesResponse> => {
  const qs = new URLSearchParams();
  if (from && to) {
    qs.set('from', from);
    qs.set('to', to);
  } else {
    qs.set('period', period);
  }
  const response = await axios.get(
    `${API_URL}/admin/affiliates/${id}/timeseries?${qs.toString()}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const getAdminAffiliateActivity = async (
  id: string,
  limit: number = 50
): Promise<{ success: boolean; data: AdminAffiliateActivityEvent[]; total: number }> => {
  const response = await axios.get(
    `${API_URL}/admin/affiliates/${id}/activity?limit=${limit}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};
