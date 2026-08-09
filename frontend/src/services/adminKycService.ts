import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

// Get auth token from localStorage
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// KYC submission interface
export interface KYCSubmission {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  kycStatus: string;
  kycSubmittedAt: any;
  kycReviewedAt?: any;
  kycDocuments?: {
    idType: string;
    hasIdDocument: boolean;
    hasSelfie: boolean;
  };
}

// KYC document details
export interface KYCDocumentDetails {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  kycStatus: string;
  kycSubmittedAt: any;
  kycReviewedAt?: any;
  kycReviewedBy?: string;
  kycRejectionReason?: string;
  kycDocuments: {
    idType: string;
    idNumber?: string;
    idDocument: string;
    selfie: string;
  };
}

// Get pending KYC submissions
export const getPendingKYC = async (status: string = 'PENDING'): Promise<{ success: boolean; data: KYCSubmission[]; total: number }> => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/kyc/pending?status=${status}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get KYC documents for a user
export const getKYCDocuments = async (userId: string): Promise<{ success: boolean; data: KYCDocumentDetails }> => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/kyc/${userId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Review KYC (approve or reject)
export const reviewKYC = async (userId: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) => {
  try {
    const response = await axios.put(
      `${API_URL}/admin/kyc/${userId}/review`,
      { status, rejectionReason },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get KYC statistics
export const getKYCStats = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/admin/kyc/stats/overview`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};
