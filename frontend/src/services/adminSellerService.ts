import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface AdminSellerRow {
  id: string;
  businessName: string;
  email: string | null;
  slug: string | null;
  logoUrl: string | null;
  verifiedSeller: boolean;
  memberSinceAsSeller: any;
  averageRating: number;
  ratingCount: number;
  balance: number;
  pendingBalance: number;
  productCount: number;
  activeListings: number;
  totalOrders: number;
  grossRevenue: number;
  netRevenue: number;
  lastActiveAt: number | null;
}

export interface AdminSellerListResponse {
  success: boolean;
  data: AdminSellerRow[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminSellerDetail extends AdminSellerRow {
  role: string;
  phone: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: any;
  lastLoginAt: any;
  sellerProfile: Record<string, any> | null;
  sellerApplication: Record<string, any> | null;
  heldBalance: number;
  kycStatus: string;
}

export interface AdminSellerTimeseriesPoint {
  date: string;
  grossRevenue: number;
  netRevenue: number;
  orders: number;
}

export interface AdminSellerTimeseriesResponse {
  success: boolean;
  data: {
    period: string;
    startDate: string;
    series: AdminSellerTimeseriesPoint[];
    totals: { grossRevenue: number; netRevenue: number; orders: number; newBids: number };
  };
}

export interface AdminSellerActivityEvent {
  type: string;
  title: string;
  detail: string | null;
  timestamp: string;
  productId?: string;
  orderId?: string;
  withdrawalId?: string;
  reviewId?: string;
}

export interface AdminListSellersParams {
  search?: string;
  verified?: 'all' | 'verified' | 'unverified';
  sortBy?: 'revenue' | 'sales' | 'rating' | 'joined' | 'products';
  page?: number;
  limit?: number;
}

export const listAdminSellers = async (
  params: AdminListSellersParams = {}
): Promise<AdminSellerListResponse> => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const response = await axios.get(`${API_URL}/admin/sellers?${qs.toString()}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminSellerDetail = async (
  sellerId: string
): Promise<{ success: boolean; data: AdminSellerDetail }> => {
  const response = await axios.get(`${API_URL}/admin/sellers/${sellerId}`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminSellerTimeseries = async (
  sellerId: string,
  period: '7d' | '30d' | '90d' | '1y' = '30d'
): Promise<AdminSellerTimeseriesResponse> => {
  const response = await axios.get(
    `${API_URL}/admin/sellers/${sellerId}/timeseries?period=${period}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const getAdminSellerProducts = async (
  sellerId: string,
  status: string = 'all'
) => {
  const response = await axios.get(
    `${API_URL}/admin/sellers/${sellerId}/products?status=${status}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const getAdminSellerOrders = async (
  sellerId: string,
  status: string = 'all'
) => {
  const response = await axios.get(
    `${API_URL}/admin/sellers/${sellerId}/orders?status=${status}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const getAdminSellerPayouts = async (sellerId: string) => {
  const response = await axios.get(`${API_URL}/admin/sellers/${sellerId}/payouts`, {
    headers: getAuthHeader()
  });
  return response.data;
};

export const getAdminSellerActivity = async (
  sellerId: string,
  limit: number = 50
): Promise<{ success: boolean; data: AdminSellerActivityEvent[]; total: number }> => {
  const response = await axios.get(
    `${API_URL}/admin/sellers/${sellerId}/activity?limit=${limit}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const toggleSellerVerified = async (sellerId: string, verified: boolean) => {
  const response = await axios.put(
    `${API_URL}/admin/users/${sellerId}/verify-seller`,
    { verified },
    { headers: getAuthHeader() }
  );
  return response.data;
};
