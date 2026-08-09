import axios from '../config/axios';

const API_URL = import.meta.env.PROD
  ? '/api'  // Production: use relative URL
  : (import.meta.env.VITE_API_URL || 'http://localhost:5000/api'); // Development

// Get auth token from localStorage
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Get user profile
export const getUserProfile = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/users/profile`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Update user profile
export const updateProfile = async (profileData: any) => {
  try {
    const response = await axios.put(
      `${API_URL}/users/profile`,
      profileData,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Upload avatar
export const uploadAvatar = async (avatarBase64: string) => {
  try {
    const response = await axios.post(
      `${API_URL}/users/avatar`,
      { avatar: avatarBase64 },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Update notification preferences
export const updateNotificationPreferences = async (preferences: any) => {
  try {
    const response = await axios.put(
      `${API_URL}/users/notifications`,
      { preferences },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get user activity
export const getUserActivity = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/users/activity`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get user dashboard data
export const getUserDashboard = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/users/dashboard`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Add to watchlist
export const addToWatchlist = async (productId: string) => {
  try {
    const response = await axios.post(
      `${API_URL}/users/watchlist/${productId}`,
      {},
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Remove from watchlist
export const removeFromWatchlist = async (productId: string) => {
  try {
    const response = await axios.delete(
      `${API_URL}/users/watchlist/${productId}`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get watchlist
export const getWatchlist = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/users/watchlist`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Change password
export const changePassword = async (currentPassword: string, newPassword: string) => {
  try {
    const response = await axios.put(
      `${API_URL}/users/password`,
      { currentPassword, newPassword },
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get user bids
export const getUserBids = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/users/bids`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};

// Get user orders
export const getUserOrders = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/users/orders`,
      { headers: getAuthHeader() }
    );
    return response.data;
  } catch (error: any) {
    throw error.response?.data || error;
  }
};