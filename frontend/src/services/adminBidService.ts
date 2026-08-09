import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface BidDetail {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  bidderEmail: string;
  amount: number;
  status: string;
  createdAt: any;
}

export interface ProductWithBids {
  product: {
    id: string;
    title: string;
    images: string[];
    currentPrice: number;
    startingPrice: number;
    status: string;
    endDate: any;
    sellerId: string;
    sellerName: string;
    totalBids?: number;
  };
  bids: BidDetail[];
}

export const getProductBids = async (productId: string): Promise<{ success: boolean; data: ProductWithBids }> => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/products/${productId}/bids`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

export const acceptBid = async (bidId: string): Promise<{ success: boolean; message: string; data: { orderId: string; winnerId: string; winnerName: string; amount: number } }> => {
  try {
    const response = await axios.post(
      `${API_URL}/admin/bids/${bidId}/accept`,
      {},
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};
