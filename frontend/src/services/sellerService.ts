import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface SellerOverview {
  businessName: string;
  slug: string;
  logoUrl: string | null;
  verifiedSeller: boolean;
  memberSinceAsSeller: any;
  availableBalance: number;
  pendingBalance: number;
  heldBalance: number;
  averageRating: number;
  ratingCount: number;
}

export interface SellerTimeseriesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface SellerTimeseriesResponse {
  success: boolean;
  data: {
    period: string;
    startDate: string;
    series: SellerTimeseriesPoint[];
    totals: { revenue: number; orders: number; newBids: number };
  };
}

export interface SellerTopProduct {
  id: string;
  title: string;
  image: string | null;
  status: string;
  currentPrice: number;
  startingPrice: number;
  totalBids: number;
  views: number;
  revenue: number;
}

export const getSellerOverview = async (): Promise<{ success: boolean; data: SellerOverview }> => {
  const response = await axios.get(`${API_URL}/seller/dashboard/overview`, { headers: getAuthHeader() });
  return response.data;
};

export const getSellerTimeseries = async (
  period: '7d' | '30d' | '90d' | '1y' = '30d'
): Promise<SellerTimeseriesResponse> => {
  const response = await axios.get(
    `${API_URL}/seller/dashboard/timeseries?period=${period}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const getSellerTopProducts = async (
  limit = 5
): Promise<{ success: boolean; data: SellerTopProduct[] }> => {
  const response = await axios.get(
    `${API_URL}/seller/dashboard/top-products?limit=${limit}`,
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const getSellerDashboardStats = async () => {
  // Reuses the existing /users/seller-dashboard endpoint
  const response = await axios.get(`${API_URL}/users/seller-dashboard`, { headers: getAuthHeader() });
  return response.data;
};

// ---------- Public seller storefront ----------

export interface PublicSeller {
  id: string;
  slug: string;
  businessName: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  contactEmail: string | null;
  returnPolicy: string;
  shippingPolicy: string;
  verifiedSeller: boolean;
  memberSinceAsSeller: any;
  averageRating: number;
  ratingCount: number;
  totalSales: number;
  activeListings: number;
}

export const getPublicSeller = async (slugOrUserId: string): Promise<{ success: boolean; data: PublicSeller }> => {
  const response = await axios.get(`${API_URL}/sellers/${slugOrUserId}`);
  return response.data;
};

export const getPublicSellerProducts = async (
  slugOrUserId: string,
  status: string = 'active'
) => {
  const response = await axios.get(`${API_URL}/sellers/${slugOrUserId}/products?status=${status}`);
  return response.data;
};

export const getPublicSellerReviews = async (
  slugOrUserId: string,
  limit: number = 20
) => {
  const response = await axios.get(`${API_URL}/sellers/${slugOrUserId}/reviews?limit=${limit}`);
  return response.data;
};
