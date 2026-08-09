import api from './api';

export interface Invitation {
  id: string;
  inviterEmail: string;
  inviterName: string;
  inviteeEmail: string;
  inviteeName?: string;
  referralCode: string;
  status: 'pending' | 'completed' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
}

export interface AffiliateStats {
  totalInvitations: number;
  pending: number;
  completed: number;
  totalEarned: number;          // released (withdrawable) commission
  pendingCommission?: number;   // held until the referred order is delivered
  owedFromReversals?: number;   // debt from refund clawbacks (settled on next release)
  referredUsersCount?: number;  // people who signed up under this affiliate (invite + direct)
  referralPurchases?: number;   // paid orders made by those users
}

export interface Referral {
  name: string;
  signupDate: string | Date | null;
  type: 'invite' | 'direct';
  purchaseCount: number;
  totalSpent: number;
  commissionGenerated: number;
}

export interface AffiliateStatusResponse {
  isAffiliate: boolean;
  kycStatus: string;
}

class AffiliateService {
  // Get affiliate status (KYC + activation state)
  async getAffiliateStatus(): Promise<AffiliateStatusResponse> {
    try {
      const response = await api.get('/affiliate/status');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch affiliate status');
    }
  }

  // Activate affiliate program
  async activateAffiliate(): Promise<{ message: string; isAffiliate: boolean }> {
    try {
      const response = await api.post('/affiliate/activate');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to activate affiliate program');
    }
  }

  // Send invitation
  async sendInvitation(email: string, name?: string): Promise<{ message: string }> {
    try {
      const response = await api.post('/affiliate/invite', { email, name });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to send invitation');
    }
  }

  // Get user's invitations
  async getInvitations(): Promise<Invitation[]> {
    try {
      const response = await api.get('/affiliate/invitations');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch invitations');
    }
  }

  // Get affiliate statistics
  async getStats(): Promise<AffiliateStats> {
    try {
      const response = await api.get('/affiliate/stats');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch statistics');
    }
  }

  // Get the people who signed up under this affiliate (invite + direct link) and their activity
  async getReferrals(): Promise<Referral[]> {
    try {
      const response = await api.get('/affiliate/referrals');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to fetch referrals');
    }
  }

  // Validate referral code
  async validateReferralCode(code: string): Promise<{
    valid: boolean;
    inviterName?: string;
    inviterEmail?: string;
    inviteeEmail?: string;
    inviteeName?: string;
    type?: 'invitation' | 'direct';
    error?: string;
  }> {
    console.log('=== AFFILIATE SERVICE: validateReferralCode ===')
    console.log('Validating code:', code)

    try {
      console.log('Making API call to /affiliate/validate/' + code)
      const response = await api.get(`/affiliate/validate/${code}`);
      console.log('API response:', response.data)
      return response.data;
    } catch (error: any) {
      console.error('Validation error:', error)
      console.error('Error status:', error.response?.status)
      console.error('Error data:', error.response?.data)

      if (error.response?.status === 404) {
        return { valid: false, error: 'Invalid referral code' };
      }
      return { valid: false, error: error.response?.data?.error || 'Failed to validate code' };
    }
  }

  // Process referral after successful registration
  async processReferral(referralCode: string, newUserId: string, newUserEmail?: string): Promise<{ message: string }> {
    console.log('=== AFFILIATE SERVICE: processReferral ===')
    console.log('Params:', { referralCode, newUserId, newUserEmail })

    try {
      console.log('Making API call to /affiliate/process-referral...')
      const response = await api.post('/affiliate/process-referral', {
        referralCode,
        newUserId,
        newUserEmail
      });
      console.log('API response:', response.data)
      return response.data;
    } catch (error: any) {
      console.error('Failed to process referral:', error);
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)
      throw new Error(error.response?.data?.error || 'Failed to process referral');
    }
  }

  // Format date
  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // Format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  // Calculate days until expiry
  getDaysUntilExpiry(expiresAt: Date | string): number {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
}

export default new AffiliateService();