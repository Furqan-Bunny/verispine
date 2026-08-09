import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export type SellerApplicationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SellerApplicationAddress {
  street: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export interface SellerApplicationPayload {
  fullName: string;
  companyName: string;
  phoneNumber: string;
  address: SellerApplicationAddress;
  businessRegNumber?: string;
  taxNumber?: string;
  termsAccepted: true;
}

export interface SellerApplicationStatusResponse {
  success: boolean;
  data: {
    status: SellerApplicationStatus;
    submittedAt: any | null;
    reviewedAt: any | null;
    rejectionReason: string | null;
    kycStatus: string;
    role: string;
    fullName: string | null;
    companyName: string | null;
    phoneNumber: string | null;
    address: SellerApplicationAddress | null;
    businessRegNumber: string | null;
    taxNumber: string | null;
  };
}

// Submit a new seller application (KYC must be APPROVED)
export const submitSellerApplication = async (data: SellerApplicationPayload) => {
  try {
    const response = await axios.post(
      `${API_URL}/seller-application/submit`,
      data,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get current user's seller application status
export const getSellerApplicationStatus = async (): Promise<SellerApplicationStatusResponse> => {
  try {
    const response = await axios.get(
      `${API_URL}/seller-application/status`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Resubmit after rejection
export const resubmitSellerApplication = async (data: SellerApplicationPayload) => {
  try {
    const response = await axios.put(
      `${API_URL}/seller-application/resubmit`,
      data,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};
