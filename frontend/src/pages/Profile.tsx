import { motion } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import {
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  BellIcon,
  KeyIcon,
  CameraIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  ArrowRightIcon,
  UserPlusIcon,
  IdentificationIcon,
  ClockIcon,
  BuildingStorefrontIcon,
  PhotoIcon
} from '@heroicons/react/24/outline'
import axios from '../config/axios'
import { formatPrice } from '../utils/formatters'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import {
  getUserProfile,
  updateProfile,
  uploadAvatar,
  updateNotificationPreferences,
  changePassword
} from '../services/userService'
import { getKYCStatus, type KYCStatus } from '../services/kycService'

const Profile = () => {
  const { user, updateUser } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState('personal')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    username: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address?.street || '',
    city: user?.address?.city || '',
    postalCode: user?.address?.postalCode || '',
    country: user?.address?.country || 'South Africa'
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [notifications, setNotifications] = useState({
    emailBids: true,
    emailWins: true,
    emailOutbid: true,
    pushBids: false,
    pushWins: true,
    pushOutbid: true
  })
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [kycStatus, setKycStatus] = useState<KYCStatus>('NOT_SUBMITTED')

  // Update form data when user data changes (e.g., after refresh)
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address?.street || '',
        city: user.address?.city || '',
        postalCode: user.address?.postalCode || '',
        country: user.address?.country || 'South Africa'
      })
      
      // Also update notifications if they exist
      if (user.preferences && user.preferences.notifications) {
        const userNotifications = user.preferences.notifications
        setNotifications(prev => ({
          ...prev,
          ...userNotifications
        }))
      }
    }
  }, [user])
  
  // Load fresh user data on mount
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const response = await getUserProfile()
        if (response.success && response.data) {
          const userData = response.data
          // Update the auth store with fresh data
          if (user) {
            const updatedUser = {
              ...user,
              ...userData,
              id: userData.id || userData.uid || user.id,
              uid: userData.uid || user.uid
            }
            updateUser(updatedUser)

            // Also update notification preferences if they exist
            if (userData.preferences?.notifications) {
              setNotifications({
                emailBids: userData.preferences.notifications.emailBids ?? true,
                emailWins: userData.preferences.notifications.emailWins ?? true,
                emailOutbid: userData.preferences.notifications.emailOutbid ?? true,
                pushBids: userData.preferences.notifications.pushBids ?? false,
                pushWins: userData.preferences.notifications.pushWins ?? true,
                pushOutbid: userData.preferences.notifications.pushOutbid ?? true
              })
            }
          }
        }

        // Fetch KYC status
        const kycResponse = await getKYCStatus()
        if (kycResponse.success) {
          setKycStatus(kycResponse.data.status)
        }
      } catch (error) {
        console.error('Error loading profile:', error)
      }
    }

    if (user) {
      loadUserProfile()
    }
  }, [])

  const isSeller = user?.role === 'seller' || user?.role === 'admin'

  const tabs = [
    { id: 'personal', label: 'Personal Info', icon: UserIcon },
    { id: 'security', label: 'Security', icon: ShieldCheckIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
    ...(isSeller ? [{ id: 'business', label: 'Business', icon: BuildingStorefrontIcon }] : []),
    { id: 'billing', label: 'Billing', icon: CreditCardIcon }
  ]

  // Business form state — initialised from user.sellerProfile
  const [businessForm, setBusinessForm] = useState({
    businessName: '',
    slug: '',
    description: '',
    contactEmail: '',
    returnPolicy: '',
    shippingPolicy: '',
    accountNumber: '',
    bankName: '',
    accountHolder: '',
    branchCode: '',
    accountType: 'Cheque'
  })
  const [businessSaving, setBusinessSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [bannerUploading, setBannerUploading] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isSeller) return
    setBusinessForm({
      businessName: user?.sellerProfile?.businessName || user?.businessName || '',
      slug: user?.sellerProfile?.slug || '',
      description: user?.sellerProfile?.description || '',
      contactEmail: user?.sellerProfile?.contactEmail || user?.email || '',
      returnPolicy: user?.sellerProfile?.returnPolicy || '',
      shippingPolicy: user?.sellerProfile?.shippingPolicy || '',
      accountNumber: user?.bankDetails?.accountNumber || '',
      bankName: user?.bankDetails?.bankName || '',
      accountHolder: user?.bankDetails?.accountHolder || '',
      branchCode: user?.bankDetails?.branchCode || '',
      accountType: user?.bankDetails?.accountType || 'Cheque'
    })
  }, [user?.sellerProfile?.businessName, user?.sellerProfile?.slug, isSeller])

  const handleBusinessSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (businessForm.businessName.trim().length < 2) {
      toast.error('Business name must be at least 2 characters')
      return
    }
    setBusinessSaving(true)
    try {
      const payload: any = {
        sellerProfile: {
          businessName: businessForm.businessName.trim(),
          slug: businessForm.slug.trim() || businessForm.businessName.trim(),
          description: businessForm.description,
          contactEmail: businessForm.contactEmail.trim(),
          returnPolicy: businessForm.returnPolicy,
          shippingPolicy: businessForm.shippingPolicy
        },
        bankDetails: {
          accountNumber: businessForm.accountNumber,
          bankName: businessForm.bankName,
          accountHolder: businessForm.accountHolder,
          branchCode: businessForm.branchCode,
          accountType: businessForm.accountType
        }
      }
      const response = await updateProfile(payload)
      if (response.success) {
        toast.success('Business profile saved')
        if (response.data) updateUser({ ...(user as any), ...response.data, id: user?.id || response.data.id })
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.error || 'Failed to save business profile')
    } finally {
      setBusinessSaving(false)
    }
  }

  const handleSellerImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'logo' | 'banner'
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxBytes = kind === 'logo' ? 2 * 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > maxBytes) {
      toast.error(`${kind === 'logo' ? 'Logo' : 'Banner'} must be ${kind === 'logo' ? '2' : '5'}MB or smaller`)
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    const setUploading = kind === 'logo' ? setLogoUploading : setBannerUploading
    setUploading(true)
    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64 = reader.result as string
        try {
          const endpoint = kind === 'logo' ? '/api/users/seller-logo' : '/api/users/seller-banner'
          const body = kind === 'logo' ? { logo: base64 } : { banner: base64 }
          const response = await axios.post(endpoint, body)
          if (response.data?.success) {
            const url = kind === 'logo' ? response.data.data.logoUrl : response.data.data.bannerUrl
            toast.success(`${kind === 'logo' ? 'Logo' : 'Banner'} uploaded`)
            updateUser({
              ...(user as any),
              sellerProfile: {
                ...(user?.sellerProfile || {}),
                [kind === 'logo' ? 'logoUrl' : 'bannerUrl']: url
              }
            })
          }
        } catch (err: any) {
          toast.error(err?.response?.data?.error || `Failed to upload ${kind}`)
        } finally {
          setUploading(false)
        }
      }
      reader.readAsDataURL(file)
    } catch {
      setUploading(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      const profileData = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        username: formData.username,
        email: formData.email,
        phone: formData.phone,
        address: {
          street: formData.address,
          city: formData.city,
          postalCode: formData.postalCode,
          country: formData.country
        }
      }
      
      const response = await updateProfile(profileData)
      
      if (response.success && user) {
        // Properly merge the updated data with existing user data
        const updatedUser = {
          ...user,
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          username: profileData.username,
          email: profileData.email,
          phone: profileData.phone,
          address: {
            street: profileData.address.street,
            city: profileData.address.city,
            postalCode: profileData.address.postalCode,
            country: profileData.address.country
          },
          ...response.data // Include any additional data from response
        }
        
        updateUser(updatedUser)
        toast.success('Profile updated successfully!')
        setIsEditing(false)
      }
    } catch (error: any) {
      toast.error(error.error || 'Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    
    setIsLoading(true)
    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword)
      toast.success('Password changed successfully!')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error: any) {
      toast.error(error.error || 'Failed to change password')
    } finally {
      setIsLoading(false)
    }
  }

  const handleNotificationUpdate = async () => {
    setIsLoading(true)
    try {
      const response = await updateNotificationPreferences(notifications)
      if (response.success) {
        // Update local user state with new preferences
        if (user) {
          updateUser({
            ...user,
            preferences: {
              ...user.preferences,
              notifications
            }
          })
        }
        toast.success('Notification preferences updated!')
      } else {
        toast.error('Failed to update preferences')
      }
    } catch (error: any) {
      console.error('Error updating notifications:', error)
      toast.error(error.message || error.error || 'Failed to update preferences')
    } finally {
      setIsLoading(false)
    }
  }
  
  const handleAddPaymentMethod = () => {
    toast('Payment methods are managed during checkout', {
      icon: '💳',
      duration: 3000
    })
  }

  const handleRemovePaymentMethod = (id: string) => {
    toast('Payment methods are managed during checkout', {
      icon: '💳',
      duration: 3000
    })
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB')
      return
    }
    
    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = reader.result as string
      setIsLoading(true)
      
      try {
        const response = await uploadAvatar(base64)
        if (response.success && user) {
          updateUser({
            ...user,
            avatar: response.data.avatar
          })
          toast.success('Avatar updated successfully!')
        }
      } catch (error: any) {
        toast.error(error.error || 'Failed to upload avatar')
      } finally {
        setIsLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4 sm:space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-50 to-secondary-50 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="relative">
              <div className="h-16 w-16 sm:h-20 sm:w-20 bg-primary-100 rounded-full flex items-center justify-center">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.username} className="h-16 w-16 sm:h-20 sm:w-20 rounded-full" />
                ) : (
                  <UserIcon className="h-8 w-8 sm:h-10 sm:w-10 text-primary-600" />
                )}
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow-lg hover:shadow-xl"
                disabled={isLoading}
              >
                <CameraIcon className="h-4 w-4 text-gray-600" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {user?.firstName} {user?.lastName}
              </h1>
              <p className="text-gray-600">@{user?.username}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {user?.emailVerified ? (
                  <span className="flex items-center text-green-600 text-sm">
                    <CheckCircleIcon className="h-4 w-4 mr-1" />
                    Verified Account
                  </span>
                ) : (
                  <span className="flex items-center text-yellow-600 text-sm">
                    <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                    Unverified Account
                  </span>
                )}
                <span className="text-gray-300">|</span>
                <Link to="/kyc" className="flex items-center text-sm hover:underline">
                  {kycStatus === 'APPROVED' ? (
                    <span className="flex items-center text-green-600">
                      <IdentificationIcon className="h-4 w-4 mr-1" />
                      KYC Verified
                    </span>
                  ) : kycStatus === 'PENDING' ? (
                    <span className="flex items-center text-yellow-600">
                      <ClockIcon className="h-4 w-4 mr-1" />
                      KYC Pending
                    </span>
                  ) : kycStatus === 'REJECTED' ? (
                    <span className="flex items-center text-red-600">
                      <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                      KYC Rejected
                    </span>
                  ) : (
                    <span className="flex items-center text-gray-500">
                      <IdentificationIcon className="h-4 w-4 mr-1" />
                      Complete KYC
                    </span>
                  )}
                </Link>
                {user?.isAffiliate && (
                  <>
                    <span className="text-gray-300">|</span>
                    <Link to="/affiliate" className="flex items-center text-sm hover:underline">
                      <span className="flex items-center text-indigo-600">
                        <UserPlusIcon className="h-4 w-4 mr-1" />
                        Affiliate
                      </span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="w-full sm:w-auto text-left sm:text-right">
            <p className="text-sm text-gray-600">Account Balance</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatPrice(user?.balance || 0)}</p>
            <p className="text-xs text-gray-500 mt-2">Earn R5 per referral!</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'personal' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-outline text-sm"
                >
                  Edit Profile
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    disabled={!isEditing}
                    placeholder="+27 12 345 6789"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={formData.country}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  disabled={!isEditing}
                  placeholder="123 Main Street"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    disabled={!isEditing}
                    placeholder="Cape Town"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    disabled={!isEditing}
                    placeholder="8001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-50"
                  />
                </div>
              </div>

              {isEditing && (
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Security Settings</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-full sm:max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={isLoading}>
                    {isLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Two-Factor Authentication</h3>
                <p className="text-gray-600 mb-4">
                  Add an extra layer of security to your account by enabling two-factor authentication.
                </p>
                <button className="btn-outline">
                  Enable 2FA
                </button>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Login History</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="text-sm font-medium">Chrome on Windows</p>
                      <p className="text-xs text-gray-500">Cape Town, South Africa</p>
                    </div>
                    <p className="text-xs text-gray-500">2 hours ago</p>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <div>
                      <p className="text-sm font-medium">Safari on iPhone</p>
                      <p className="text-xs text-gray-500">Johannesburg, South Africa</p>
                    </div>
                    <p className="text-xs text-gray-500">1 day ago</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Notification Preferences</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Email Notifications</h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.emailBids}
                      onChange={(e) => setNotifications({ ...notifications, emailBids: e.target.checked })}
                      className="mr-3"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Bid Updates</p>
                      <p className="text-xs text-gray-500">Get notified when someone bids on your watched items</p>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.emailWins}
                      onChange={(e) => setNotifications({ ...notifications, emailWins: e.target.checked })}
                      className="mr-3"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Auction Wins</p>
                      <p className="text-xs text-gray-500">Get notified when you win an auction</p>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.emailOutbid}
                      onChange={(e) => setNotifications({ ...notifications, emailOutbid: e.target.checked })}
                      className="mr-3"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Outbid Alerts</p>
                      <p className="text-xs text-gray-500">Get notified when you're outbid</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Push Notifications</h3>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.pushBids}
                      onChange={(e) => setNotifications({ ...notifications, pushBids: e.target.checked })}
                      className="mr-3"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Bid Updates</p>
                      <p className="text-xs text-gray-500">Receive push notifications for bid activity</p>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.pushWins}
                      onChange={(e) => setNotifications({ ...notifications, pushWins: e.target.checked })}
                      className="mr-3"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Auction Wins</p>
                      <p className="text-xs text-gray-500">Receive push notifications when you win</p>
                    </div>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.pushOutbid}
                      onChange={(e) => setNotifications({ ...notifications, pushOutbid: e.target.checked })}
                      className="mr-3"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Outbid Alerts</p>
                      <p className="text-xs text-gray-500">Receive push notifications when outbid</p>
                    </div>
                  </label>
                </div>
              </div>

              <button onClick={handleNotificationUpdate} className="btn-primary" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'business' && isSeller && (
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Business Profile</h2>
                <p className="text-sm text-gray-500 mt-1">
                  This information appears on your public storefront and customer-facing pages.
                </p>
              </div>
              {user?.sellerProfile?.slug && (
                <Link
                  to={`/seller/${user.sellerProfile.slug || user.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline text-sm flex items-center gap-2"
                >
                  View Storefront <ArrowRightIcon className="h-4 w-4" />
                </Link>
              )}
            </div>

            <form onSubmit={handleBusinessSave} className="space-y-6">
              {/* Brand assets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Logo (max 2MB)</label>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => handleSellerImageUpload(e, 'logo')} />
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden">
                      {user?.sellerProfile?.logoUrl ? (
                        <img src={user.sellerProfile.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <PhotoIcon className="h-10 w-10 text-gray-300" />
                      )}
                    </div>
                    <button type="button" disabled={logoUploading}
                      onClick={() => logoInputRef.current?.click()}
                      className="btn-outline text-sm">
                      {logoUploading ? 'Uploading...' : (user?.sellerProfile?.logoUrl ? 'Change Logo' : 'Upload Logo')}
                    </button>
                  </div>
                </div>

                {/* Banner */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Banner (max 5MB)</label>
                  <input ref={bannerInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => handleSellerImageUpload(e, 'banner')} />
                  <div className="space-y-2">
                    <div className="w-full h-24 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden">
                      {user?.sellerProfile?.bannerUrl ? (
                        <img src={user.sellerProfile.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                      ) : (
                        <PhotoIcon className="h-10 w-10 text-gray-300" />
                      )}
                    </div>
                    <button type="button" disabled={bannerUploading}
                      onClick={() => bannerInputRef.current?.click()}
                      className="btn-outline text-sm w-full">
                      {bannerUploading ? 'Uploading...' : (user?.sellerProfile?.bannerUrl ? 'Change Banner' : 'Upload Banner')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Business identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
                  <input type="text" maxLength={60} required
                    value={businessForm.businessName}
                    onChange={(e) => setBusinessForm(f => ({ ...f, businessName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Storefront URL slug
                  </label>
                  <div className="flex items-center gap-1 text-sm">
                    <span className="text-gray-500">/seller/</span>
                    <input type="text"
                      value={businessForm.slug}
                      onChange={(e) => setBusinessForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea maxLength={500} rows={3}
                    value={businessForm.description}
                    onChange={(e) => setBusinessForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Tell buyers about your business…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                  <input type="email"
                    value={businessForm.contactEmail}
                    onChange={(e) => setBusinessForm(f => ({ ...f, contactEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Return Policy</label>
                  <textarea rows={3} maxLength={1000}
                    value={businessForm.returnPolicy}
                    onChange={(e) => setBusinessForm(f => ({ ...f, returnPolicy: e.target.value }))}
                    placeholder="e.g. Returns accepted within 7 days…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Policy</label>
                  <textarea rows={3} maxLength={1000}
                    value={businessForm.shippingPolicy}
                    onChange={(e) => setBusinessForm(f => ({ ...f, shippingPolicy: e.target.value }))}
                    placeholder="e.g. Ships within 2 business days via SAPO…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>

              {/* Bank details for payouts */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Payout Bank Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Holder Name</label>
                    <input type="text"
                      value={businessForm.accountHolder}
                      onChange={(e) => setBusinessForm(f => ({ ...f, accountHolder: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
                    <input type="text"
                      value={businessForm.bankName}
                      onChange={(e) => setBusinessForm(f => ({ ...f, bankName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
                    <input type="text"
                      value={businessForm.accountNumber}
                      onChange={(e) => setBusinessForm(f => ({ ...f, accountNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Branch Code</label>
                    <input type="text"
                      value={businessForm.branchCode}
                      onChange={(e) => setBusinessForm(f => ({ ...f, branchCode: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
                    <select
                      value={businessForm.accountType}
                      onChange={(e) => setBusinessForm(f => ({ ...f, accountType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                      <option value="Cheque">Cheque</option>
                      <option value="Savings">Savings</option>
                      <option value="Transmission">Transmission</option>
                    </select>
                  </div>
                </div>
              </div>

              <button type="submit" disabled={businessSaving} className="btn-primary w-full md:w-auto">
                {businessSaving ? 'Saving…' : 'Save Business Profile'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'billing' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Billing & Payments</h2>
            
            <div className="space-y-6">
              {/* Wallet Balance Section */}
              <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-4 sm:p-6 text-white">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <BanknotesIcon className="h-6 w-6" />
                      <h3 className="text-lg font-medium">Wallet Balance</h3>
                    </div>
                    <p className="text-2xl sm:text-3xl font-bold">{formatPrice(user?.balance || 0)}</p>
                    <p className="text-primary-100 text-sm mt-1">Available for bidding and purchases</p>
                  </div>
                  <div className="flex flex-col gap-2 w-full sm:w-auto">
                    <Link 
                      to="/withdrawals"
                      className="flex items-center justify-center gap-2 bg-white text-primary-600 px-3 sm:px-4 py-2 rounded-lg font-semibold hover:bg-primary-50 transition text-sm sm:text-base"
                    >
                      <BanknotesIcon className="h-5 w-5" />
                      Withdraw Funds
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>
                    {user?.isAffiliate && (
                      <Link
                        to="/affiliate"
                        className="flex items-center justify-center gap-2 bg-green-500 text-white px-3 sm:px-4 py-2 rounded-lg font-semibold hover:bg-green-400 transition text-sm sm:text-base"
                      >
                        <UserPlusIcon className="h-5 w-5" />
                        Invite & Earn
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Card Payments</h3>
                <p className="text-sm text-gray-500">
                  Card details are entered securely on Traderoot's 3D Secure page each time you pay or top up — nothing is stored on VeriSpine.
                </p>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Billing History</h3>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      <tr>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">2024-01-15</td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">Won Auction - iPhone 14 Pro</td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">{formatPrice(16500)}</td>
                        <td className="px-2 sm:px-4 py-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Paid
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">2024-01-10</td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">Referral Reward</td>
                        <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm">{formatPrice(5000)}</td>
                        <td className="px-2 sm:px-4 py-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Completed
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default Profile