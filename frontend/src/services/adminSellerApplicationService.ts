import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface SellerApplicationListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  kycStatus: string;
  role: string;
  application: {
    status: string;
    submittedAt: any;
    reviewedAt?: any;
    fullName: string;
    companyName: string;
    phoneNumber: string;
  };
}

export interface SellerApplicationDetail {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  kycStatus: string;
  application: {
    status: string;
    submittedAt: any;
    reviewedAt: any;
    reviewedBy: string | null;
    rejectionReason: string | null;
    fullName: string;
    companyName: string;
    phoneNumber: string;
    address: {
      street: string;
      city: string;
      province: string;
      postalCode: string;
      country: string;
    };
    businessRegNumber: string | null;
    taxNumber: string | null;
    termsAcceptedAt: any;
    termsVersion: string;
  };
}

export const getPendingSellerApplications = async (
  status: string = 'PENDING'
): Promise<{ success: boolean; data: SellerApplicationListItem[]; total: number }> => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/seller-applications/pending?status=${status}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

export const getSellerApplicationDetail = async (
  userId: string
): Promise<{ success: boolean; data: SellerApplicationDetail }> => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/seller-applications/${userId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

export const reviewSellerApplication = async (
  userId: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
) => {
  try {
    const response = await axios.put(
      `${API_URL}/admin/seller-applications/${userId}/review`,
      { status, rejectionReason },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

export const getSellerApplicationStats = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/seller-applications/stats/overview`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};
