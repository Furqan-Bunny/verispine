import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface InitiateResponse {
  success: boolean;
  paymentUrl?: string;
  error?: string;
}

export interface VerifyResponse {
  success: boolean;
  status?: string;
  amount?: number;
}

// ---- Order checkout (e-Commerce Immediate Payment) ----

// Start an immediate card payment for an order. Returns a single hosted-page URL that does
// card entry + 3-D Secure + settlement; redirect the browser to paymentUrl.
export const initializeTraderoot = async (orderId: string): Promise<InitiateResponse> => {
  const response = await axios.post(
    `${API_URL}/payments/traderoot/initialize`,
    { orderId },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// Confirm settlement after the browser returns from the hosted page (the notification webhook is the
// authoritative settlement path; `data` is the decoded callback payload, used as a dev fallback).
export const verifyTraderootPayment = async (
  orderId: string,
  data?: any
): Promise<VerifyResponse> => {
  const response = await axios.post(
    `${API_URL}/payments/traderoot/verify-payment`,
    { orderId, data },
    { headers: getAuthHeader() }
  );
  return response.data;
};

// ---- Wallet top-up (e-Commerce Immediate Payment) ----

export const initTraderootTopup = async (topupId: string): Promise<InitiateResponse> => {
  const response = await axios.post(
    `${API_URL}/payments/traderoot/topup/initialize`,
    { topupId },
    { headers: getAuthHeader() }
  );
  return response.data;
};

export const verifyTraderootTopup = async (
  topupId: string,
  data?: any
): Promise<VerifyResponse> => {
  const response = await axios.post(
    `${API_URL}/payments/traderoot/topup/verify`,
    { topupId, data },
    { headers: getAuthHeader() }
  );
  return response.data;
};
