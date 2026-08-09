import { create } from 'zustand'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import firebaseAuth from '../services/firebaseAuth'
import { auth } from '../config/firebase'
import notificationService from '../services/notificationService'

// Single token-refresh timer shared across the store; cleared on logout so repeated
// login/logout cycles don't stack intervals (memory + redundant-request leak).
let tokenRefreshTimer: ReturnType<typeof setInterval> | null = null

interface User {
  id: string
  uid?: string
  username: string
  email: string
  firstName: string
  lastName: string
  role: 'user' | 'seller' | 'admin'
  avatar?: string
  balance: number
  emailVerified: boolean
  phone?: string
  address?: {
    street?: string
    city?: string
    postalCode?: string
    country?: string
  }
  kycStatus?: string
  isAffiliate?: boolean
  watchlist?: string[]
  businessName?: string
  bankDetails?: {
    accountNumber?: string
    bankName?: string
    accountHolder?: string
    branchCode?: string
    accountType?: string
  }
  sellerProfile?: {
    businessName?: string
    slug?: string
    description?: string
    logoUrl?: string | null
    bannerUrl?: string | null
    contactEmail?: string
    returnPolicy?: string
    shippingPolicy?: string
    verifiedSeller?: boolean
    memberSinceAsSeller?: any
    totalSales?: number
    totalRevenue?: number
    activeListings?: number
    averageRating?: number
    ratingCount?: number
  }
  sellerApplication?: {
    status?: string
    submittedAt?: any
    reviewedAt?: any
    rejectionReason?: string | null
  }
  preferences?: {
    notifications?: {
      emailBids?: boolean
      emailWins?: boolean
      emailOutbid?: boolean
      pushBids?: boolean
      pushWins?: boolean
      pushOutbid?: boolean
    }
  }
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  
  login: (email: string, password: string) => Promise<void>
  // Resolves without a session — the caller sends the user to verify their email.
  register: (data: any) => Promise<{ email: string; requiresVerification: true }>
  logout: () => void
  initAuth: () => void
  updateUser: (user: User) => void
}

// For Railway deployment, use relative URL in production
const getApiUrl = () => {
  if (import.meta.env.PROD) {
    // In production, use relative URL
    return '/api'
  }
  // In development, use environment variable or localhost
  return import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
}

const API_URL = getApiUrl()

// Initialize auth state from localStorage immediately
const getInitialAuthState = () => {
  const savedToken = localStorage.getItem('token')
  const savedUser = localStorage.getItem('user')
  
  if (savedToken && savedUser) {
    try {
      const user = JSON.parse(savedUser) as User
      axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`
      return {
        user,
        token: savedToken,
        isAuthenticated: true,
        isLoading: false
      }
    } catch (error) {
      console.error('Error parsing saved user:', error)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }
  
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false
  }
}

// Map Firebase error codes to user-friendly messages
const getFirebaseErrorMessage = (error: any): string => {
  const errorCode = error.code || '';
  const errorMessage = error.message || '';

  // Extract error code from message if not in code property
  const codeMatch = errorMessage.match(/\(auth\/([^)]+)\)/);
  const code = errorCode || (codeMatch ? `auth/${codeMatch[1]}` : '');

  const errorMessages: { [key: string]: string } = {
    // Registration errors
    'auth/email-already-in-use': 'This email is already registered. Please login or use a different email.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password is too weak. Use at least 6 characters with uppercase, lowercase, and numbers.',
    'auth/operation-not-allowed': 'Registration is currently disabled. Please try again later.',

    // Login errors
    'auth/user-not-found': 'No account found with this email. Please register first.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
    'auth/user-disabled': 'This account has been disabled. Please contact support.',
    'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes and try again.',

    // Network errors
    'auth/network-request-failed': 'Network error. Please check your internet connection.',
    'auth/internal-error': 'Server error. Please try again later.',

    // Username errors (custom)
    'username-taken': 'This username is already taken. Please choose a different one.',
  };

  // Return mapped message or clean up the original message
  if (code && errorMessages[code]) {
    return errorMessages[code];
  }

  // Try to extract meaningful message from Firebase error
  if (errorMessage.includes('Firebase:')) {
    // Remove Firebase prefix and error code, keep the actual message
    const cleaned = errorMessage
      .replace('Firebase:', '')
      .replace(/\(auth\/[^)]+\)\.?/g, '')
      .replace('Error', '')
      .trim();

    // If we still have something meaningful, return it
    if (cleaned && cleaned.length > 3) {
      return cleaned;
    }
  }

  // Default fallback
  return errorMessage || 'An unexpected error occurred. Please try again.';
};

export const useAuthStore = create<AuthState>((set) => ({
  ...getInitialAuthState(),

  initAuth: () => {
    console.log('Initializing Firebase auth listener...')
    
    // Don't set loading if we already have auth from localStorage
    const currentState = useAuthStore.getState()
    if (!currentState.isAuthenticated) {
      set({ isLoading: true })
    }
    
    // Listen to Firebase auth state changes
    firebaseAuth.onAuthStateChanged(async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser ? 'User logged in' : 'No user')
      
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken(true) // Force refresh token
          console.log('Got token for user:', firebaseUser.email)
          
          const userProfile = await firebaseAuth.getCurrentUser()
          console.log('User profile from Firestore:', userProfile)
          
          if (userProfile) {
            const formattedUser: User = {
              id: userProfile.uid,
              uid: userProfile.uid,
              username: userProfile.username,
              email: userProfile.email,
              firstName: userProfile.firstName,
              lastName: userProfile.lastName,
              role: userProfile.role,
              balance: userProfile.balance,
              emailVerified: userProfile.emailVerified,
              avatar: userProfile.avatar,
              kycStatus: userProfile.kycStatus,
              isAffiliate: userProfile.isAffiliate
            }

            localStorage.setItem('token', token)
            localStorage.setItem('user', JSON.stringify(formattedUser))
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
            
            // Refresh token every 50 minutes (Firebase tokens expire after 1 hour).
            // Clear any previous timer first so repeated logins don't stack intervals.
            if (tokenRefreshTimer) clearInterval(tokenRefreshTimer)
            tokenRefreshTimer = setInterval(async () => {
              try {
                const refreshedToken = await firebaseUser.getIdToken(true)
                localStorage.setItem('token', refreshedToken)
                axios.defaults.headers.common['Authorization'] = `Bearer ${refreshedToken}`
              } catch (error) {
                console.error('Error refreshing token:', error)
              }
            }, 50 * 60 * 1000)
            
            console.log('Auth initialized successfully for:', formattedUser.email, 'Role:', formattedUser.role)

            // Initialize notification service with user ID
            notificationService.setUser(formattedUser.id)

            set({
              user: formattedUser,
              token,
              isAuthenticated: true,
              isLoading: false
            })
          } else {
            console.log('No user profile found in Firestore')
            set({ isLoading: false })
          }
        } catch (error) {
          console.error('Error initializing auth:', error)
          set({ isLoading: false })
        }
      } else {
        // No user logged in
        console.log('No user logged in, clearing auth state')
        if (tokenRefreshTimer) { clearInterval(tokenRefreshTimer); tokenRefreshTimer = null }
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        delete axios.defaults.headers.common['Authorization']
        
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false
        })
      }
    })
    
    // Set a timeout to prevent infinite loading
    setTimeout(() => {
      const state = useAuthStore.getState()
      if (state.isLoading) {
        console.log('Auth initialization timeout - setting loading to false')
        set({ isLoading: false })
      }
    }, 5000)
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      // Use Firebase authentication
      const response = await firebaseAuth.login(email, password)
      const { token, user } = response

      /**
       * Refuse to establish a session for an unverified address.
       *
       * The login page already redirected unverified users to the OTP screen,
       * but only AFTER the token was stored and isAuthenticated was set — so the
       * user could navigate away from that screen and browse as a fully
       * authenticated account with an email they may not own. The signed-out
       * error carries the address so the OTP screen can be pre-filled.
       */
      if (!user.emailVerified) {
        await firebaseAuth.logout().catch(() => {})
        set({ isLoading: false })
        const err: any = new Error('Please verify your email address before signing in.')
        err.requiresVerification = true
        err.email = user.email
        throw err
      }

      // Format user object to match our interface
      const formattedUser: User = {
        id: user.uid,
        uid: user.uid,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        balance: user.balance,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        kycStatus: user.kycStatus,
        isAffiliate: user.isAffiliate
      }

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(formattedUser))
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

      // Initialize notification service with user ID
      notificationService.setUser(formattedUser.id)

      set({
        user: formattedUser,
        token,
        isAuthenticated: true,
        isLoading: false
      })

      toast.success('Login successful!')
    } catch (error: any) {
      set({ isLoading: false })
      // The verification error already carries a user-facing message; running it
      // through the Firebase error mapper would replace it with a generic one.
      toast.error(error?.requiresVerification ? error.message : getFirebaseErrorMessage(error))
      throw error
    }
  },

  register: async (data: any) => {
    set({ isLoading: true })
    try {
      // Use Firebase authentication
      const response = await firebaseAuth.register(data)
      const { token, user } = response

      // Format user object to match our interface
      const formattedUser: User = {
        id: user.uid,
        uid: user.uid,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        balance: user.balance,
        emailVerified: user.emailVerified,
        avatar: user.avatar,
        kycStatus: user.kycStatus,
        isAffiliate: user.isAffiliate
      }

      /**
       * Do NOT establish a session yet.
       *
       * Registration used to set isAuthenticated with emailVerified still false,
       * so a new user could simply navigate away from the OTP screen and browse,
       * bid and check out on an address they had not proved they own — the same
       * hole that was closed on the login path. Both OTP endpoints
       * (/verify-email, /resend-verification) are unauthenticated and take the
       * address in the body, so the verification screen needs no token.
       *
       * The account exists; the user signs in normally once verified.
       */
      await firebaseAuth.logout().catch(() => {})

      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      })

      toast.success('Account created. Enter the code we emailed you to finish signing up.')
      return { email: formattedUser.email, requiresVerification: true }
    } catch (error: any) {
      set({ isLoading: false })
      const errorMessage = getFirebaseErrorMessage(error)
      toast.error(errorMessage)
      throw error
    }
  },

  logout: async () => {
    try {
      await firebaseAuth.logout()
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      delete axios.defaults.headers.common['Authorization']

      // Clear notification service
      notificationService.setUser(null)

      set({
        user: null,
        token: null,
        isAuthenticated: false
      })

      toast.success('Logged out successfully')
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('Failed to logout')
    }
  },

  updateUser: (user: User) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  }
}))