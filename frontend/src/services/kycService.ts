import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api');

// Get auth token from localStorage
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// KYC Status types
export type KYCStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

// ID Type options
export type IDType = 'id_card' | 'passport' | 'drivers_license';

export const ID_TYPE_LABELS: Record<IDType, string> = {
  id_card: 'State ID Card',
  passport: 'Passport',
  drivers_license: "Driver's License"
};

// KYC Status response interface
export interface KYCStatusResponse {
  success: boolean;
  data: {
    status: KYCStatus;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    documents?: {
      idType: IDType;
      hasIdDocument: boolean;
      hasSelfie: boolean;
    };
  };
}

// Submit KYC documents
export const submitKYC = async (data: {
  idType: IDType;
  idNumber?: string;
  idDocument: string; // base64
  selfie: string; // base64
}) => {
  try {
    const response = await axios.post(
      `${API_URL}/kyc/submit`,
      data,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get KYC status
export const getKYCStatus = async (): Promise<KYCStatusResponse> => {
  try {
    const response = await axios.get(
      `${API_URL}/kyc/status`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Resubmit KYC after rejection
export const resubmitKYC = async (data: {
  idType: IDType;
  idNumber?: string;
  idDocument: string;
  selfie: string;
}) => {
  try {
    const response = await axios.put(
      `${API_URL}/kyc/resubmit`,
      data,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};
