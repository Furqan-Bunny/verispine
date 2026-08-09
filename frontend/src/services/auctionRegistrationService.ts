import api from './api';

export interface RegistrationStatus {
  isRegistered: boolean;
  registeredAt?: string;
  fee?: number;
}

export interface RegistrationResult {
  success: boolean;
  message: string;
  registration?: {
    auctionId: string;
    fee: number;
    registeredAt: string;
  };
  newBalance?: number;
}

const auctionRegistrationService = {
  // Check if user is registered for an auction
  async checkRegistration(auctionId: string): Promise<RegistrationStatus> {
    const response = await api.get(`/auction-registration/${auctionId}/check`);
    return response.data;
  },

  // Register for a live auction (pay entry fee)
  async register(auctionId: string): Promise<RegistrationResult> {
    const response = await api.post(`/auction-registration/${auctionId}/register`);
    return response.data;
  },

  // Get user's registration history
  async getMyRegistrations(): Promise<any[]> {
    const response = await api.get('/auction-registration/my-registrations');
    return response.data.registrations || [];
  }
};

export default auctionRegistrationService;
