import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FiMail, FiUsers, FiGift, FiSend, FiCheck, FiClock, FiDollarSign, FiShield, FiUserPlus } from 'react-icons/fi';
import affiliateService, { Invitation, AffiliateStats, Referral } from '../services/affiliateService';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';

const Affiliate: React.FC = () => {
  const { user, updateUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [stats, setStats] = useState<AffiliateStats>({
    totalInvitations: 0,
    pending: 0,
    completed: 0,
    totalEarned: 0,
    pendingCommission: 0,
    referredUsersCount: 0,
    referralPurchases: 0
  });
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [affiliateStatus, setAffiliateStatus] = useState<{ isAffiliate: boolean; kycStatus: string }>({
    isAffiliate: false,
    kycStatus: 'NOT_SUBMITTED'
  });

  useEffect(() => {
    loadAffiliateStatus();
  }, []);

  const loadAffiliateStatus = async () => {
    try {
      const status = await affiliateService.getAffiliateStatus();
      setAffiliateStatus(status);

      // If active affiliate, load dashboard data
      if (status.isAffiliate) {
        await loadDashboardData();
      }
    } catch (error) {
      console.error('Error loading affiliate status:', error);
      toast.error('Failed to load affiliate status');
    } finally {
      setLoading(false);
    }
  };

  const loadDashboardData = async () => {
    try {
      const [invitationsData, statsData, referralsData] = await Promise.all([
        affiliateService.getInvitations(),
        affiliateService.getStats(),
        affiliateService.getReferrals()
      ]);
      setInvitations(invitationsData);
      setStats(statsData);
      setReferrals(referralsData);
    } catch (error) {
      console.error('Error loading affiliate data:', error);
      toast.error('Failed to load affiliate data');
    }
  };

  const handleActivate = async () => {
    setActivating(true);
    try {
      await affiliateService.activateAffiliate();
      toast.success('Affiliate program activated!');
      setAffiliateStatus({ ...affiliateStatus, isAffiliate: true });

      // Update user in auth store
      if (user) {
        updateUser({ ...user, isAffiliate: true });
      }

      // Load dashboard data now
      await loadDashboardData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to activate affiliate program');
    } finally {
      setActivating(false);
    }
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Please enter an email address');
      return;
    }

    setSending(true);
    try {
      await affiliateService.sendInvitation(email, name);
      toast.success('Invitation sent successfully!');
      setEmail('');
      setName('');
      loadDashboardData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const copyReferralLink = () => {
    const referralLink = `${window.location.origin}/register?ref=${user?.uid}`;
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // State 1: KYC not approved
  if (affiliateStatus.kycStatus !== 'APPROVED') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-yellow-100 mb-6">
            <FiShield className="h-10 w-10 text-yellow-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">KYC Verification Required</h1>
          <p className="text-lg text-gray-600 mb-2">
            To join the Affiliate Program, you need to complete your KYC verification first.
          </p>
          <p className="text-gray-500 mb-8">
            {affiliateStatus.kycStatus === 'PENDING'
              ? 'Your KYC verification is currently under review. We\'ll notify you once it\'s approved.'
              : affiliateStatus.kycStatus === 'REJECTED'
              ? 'Your KYC verification was rejected. Please resubmit with correct documents.'
              : 'This is a quick process that helps us verify your identity and keep the platform safe.'}
          </p>
          <Link
            to="/kyc"
            className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold transition"
          >
            <FiShield className="mr-2" />
            {affiliateStatus.kycStatus === 'PENDING' ? 'View KYC Status' : 'Complete KYC Verification'}
          </Link>
        </div>
      </div>
    );
  }

  // State 2: KYC approved but affiliate not activated
  if (!affiliateStatus.isAffiliate) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-10">
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-indigo-100 mb-6">
            <FiUserPlus className="h-10 w-10 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Join the Affiliate Program</h1>
          <p className="text-lg text-gray-600 mb-8">
            Earn 5% commission on every purchase made by people you refer to VeriSpine!
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="flex-shrink-0 bg-indigo-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold mx-auto mb-3">
              1
            </div>
            <h3 className="font-semibold mb-2">Invite Friends</h3>
            <p className="text-sm text-gray-600">Send invitations via email or share your unique referral link</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="flex-shrink-0 bg-indigo-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold mx-auto mb-3">
              2
            </div>
            <h3 className="font-semibold mb-2">Friends Sign Up</h3>
            <p className="text-sm text-gray-600">They create an account using your referral link</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="flex-shrink-0 bg-indigo-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold mx-auto mb-3">
              3
            </div>
            <h3 className="font-semibold mb-2">Earn Commission</h3>
            <p className="text-sm text-gray-600">Get 5% on every purchase your referrals make</p>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={handleActivate}
            disabled={activating}
            className="inline-flex items-center px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {activating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Activating...
              </>
            ) : (
              <>
                <FiUserPlus className="mr-2" />
                Activate Affiliate Program
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // State 3: Active affiliate — full dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Affiliate Program</h1>
        <p className="mt-2 text-gray-600">
          Invite friends to join VeriSpine and earn 5% commission on their purchases!
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Referred Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.referredUsersCount ?? 0}</p>
              {(stats.referralPurchases ?? 0) > 0 && (
                <p className="text-xs text-gray-500 mt-1">{stats.referralPurchases} purchases</p>
              )}
            </div>
            <FiUsers className="text-3xl text-indigo-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Invitations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalInvitations}</p>
            </div>
            <FiMail className="text-3xl text-indigo-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </div>
            <FiClock className="text-3xl text-yellow-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Registered</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <FiCheck className="text-3xl text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Commission Earned</p>
              <p className="text-2xl font-bold text-green-600">
                {affiliateService.formatCurrency(stats.totalEarned)}
              </p>
              {(stats.pendingCommission ?? 0) > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {affiliateService.formatCurrency(stats.pendingCommission ?? 0)} pending
                </p>
              )}
            </div>
            <FiDollarSign className="text-3xl text-green-600" />
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-4 mb-8">
        You earn 5% on every purchase your referrals make. Commission is held as “pending” and released to your withdrawable balance once the referred order is delivered.
      </p>

      {/* Your Referrals */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <FiUsers className="mr-2" />
            Your Referrals
          </h2>

          {referrals.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FiUsers className="mx-auto text-4xl mb-2" />
              <p>No one has signed up with your link yet</p>
              <p className="text-sm mt-1">Share your referral link or send an invitation to get started!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signed Up</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Via</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchases</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {referrals.map((r, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {r.signupDate ? affiliateService.formatDate(r.signupDate) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          r.type === 'invite' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {r.type === 'invite' ? 'Invitation' : 'Referral link'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{r.purchaseCount}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-600">
                        {affiliateService.formatCurrency(r.commissionGenerated)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invitation Form */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <FiSend className="mr-2" />
            Send Invitation
          </h2>

          <form onSubmit={handleSendInvitation}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Friend's name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <button
                type="submit"
                disabled={sending}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <FiSend className="mr-2" />
                    Send Invitation
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={copyReferralLink}
                className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
              >
                <FiGift className="mr-2" />
                Copy Referral Link
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Invitations List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <FiUsers className="mr-2" />
            Your Invitations
          </h2>

          {invitations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FiMail className="mx-auto text-4xl mb-2" />
              <p>No invitations sent yet</p>
              <p className="text-sm mt-1">Start inviting friends to earn rewards!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invitee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sent Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires In
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invitations.map((invitation) => (
                    <tr key={invitation.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {invitation.inviteeEmail}
                          </p>
                          {invitation.inviteeName && (
                            <p className="text-sm text-gray-500">{invitation.inviteeName}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {invitation.status === 'pending' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <FiClock className="mr-1" />
                            Pending
                          </span>
                        )}
                        {invitation.status === 'completed' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <FiCheck className="mr-1" />
                            Registered
                          </span>
                        )}
                        {invitation.status === 'expired' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Expired
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {affiliateService.formatDate(invitation.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {invitation.status === 'pending' ? (
                          <span>{affiliateService.getDaysUntilExpiry(invitation.expiresAt)} days</span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="mt-8 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">How It Works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
              1
            </div>
            <div className="ml-3">
              <p className="font-medium">Send Invitation</p>
              <p className="text-sm text-gray-600">
                Enter your friend's email or share your referral link
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
              2
            </div>
            <div className="ml-3">
              <p className="font-medium">Friend Signs Up</p>
              <p className="text-sm text-gray-600">
                Your friend creates an account using the invitation link
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0 bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
              3
            </div>
            <div className="ml-3">
              <p className="font-medium">Earn 5% Commission</p>
              <p className="text-sm text-gray-600">
                Earn 5% on every purchase your friend makes
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Affiliate;
