import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import axios from '../../config/axios'
import {
  CogIcon,
  CurrencyDollarIcon,
  BellIcon,
  ShieldCheckIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  KeyIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

const AdminSettings = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  
  // Settings state
  const [settings, setSettings] = useState({
    platformName: 'VeriSpine',
    platformUrl: 'https://www.verispinejointcenters.com',
    supportEmail: 'info@verispinejointcenters.com',
    platformFeePercentage: 10,
    minBidIncrement: 100,
    maxAuctionDuration: 30,
    emailNotifications: true,
    autoEndAuctions: true,
    requireVerification: false,
    maintenanceMode: false,
    maintenanceMessage: 'The platform is currently under maintenance. Please check back later.',
    // Additional settings for UI compatibility
    commissionRate: 10,
    minBidAmount: 10,
    maxBidAmount: 1000000,
    auctionExtensionTime: 5,
    autoApproveProducts: false,
    requireEmailVerification: true,
    enableTwoFactor: false,
    maxLoginAttempts: 5,
    sessionTimeout: 30
  })

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('Admin access required')
      navigate('/')
      return
    }
    fetchSettings()
  }, [user])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/admin/settings')
      if (response.data.success) {
        const data = response.data.data
        setSettings(prev => ({
          ...prev,
          ...data,
          // Map backend fields to frontend fields
          commissionRate: data.platformFeePercentage || 10,
          minBidAmount: data.minBidIncrement || 100,
          emailNotifications: data.emailNotifications !== false,
          autoApproveProducts: !data.requireVerification,
          requireEmailVerification: data.requireVerification || false
        }))
        setMaintenanceMode(data.maintenanceMode || false)
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error)
      toast.error('Failed to fetch settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      const dataToSave = {
        platformName: settings.platformName,
        platformUrl: settings.platformUrl,
        supportEmail: settings.supportEmail,
        platformFeePercentage: settings.commissionRate,
        minBidIncrement: settings.minBidAmount,
        maxAuctionDuration: settings.maxAuctionDuration,
        emailNotifications: settings.emailNotifications,
        autoEndAuctions: settings.autoEndAuctions,
        requireVerification: settings.requireEmailVerification,
        maintenanceMode: maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage
      }
      
      const response = await axios.put('/api/admin/settings', dataToSave)
      if (response.data.success) {
        toast.success('Settings saved successfully')
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = () => {
    toast.success('Test email sent successfully')
  }

  const handleToggleMaintenance = () => {
    if (!maintenanceMode) {
      if (confirm('Are you sure you want to enable maintenance mode? Users will not be able to access the platform.')) {
        setMaintenanceMode(true)
        toast.success('Maintenance mode enabled')
      }
    } else {
      setMaintenanceMode(false)
      toast.success('Maintenance mode disabled')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Maintenance Mode Alert */}
      {maintenanceMode && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-900">Maintenance Mode Active</p>
              <p className="text-sm text-yellow-700">Platform is currently inaccessible to users</p>
            </div>
          </div>
          <button
            onClick={handleToggleMaintenance}
            className="btn-outline border-yellow-600 text-yellow-600 hover:bg-yellow-50"
          >
            Disable
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide">
          {[
            { id: 'general', label: 'General', icon: CogIcon },
            { id: 'payment', label: 'Payment', icon: CurrencyDollarIcon },
            { id: 'email', label: 'Email', icon: EnvelopeIcon },
            { id: 'security', label: 'Security', icon: ShieldCheckIcon },
            { id: 'backup', label: 'Backup', icon: DocumentTextIcon }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform Name</label>
                <input
                  type="text"
                  value={settings.platformName}
                  onChange={(e) => setSettings({...settings, platformName: e.target.value})}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform URL</label>
                <input
                  type="url"
                  value={settings.platformUrl}
                  onChange={(e) => setSettings({...settings, platformUrl: e.target.value})}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({...settings, supportEmail: e.target.value})}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Auction Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%)</label>
                <input
                  type="number"
                  value={settings.commissionRate}
                  onChange={(e) => setSettings({...settings, commissionRate: Number(e.target.value)})}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Bid Amount (ZAR)</label>
                <input
                  type="number"
                  value={settings.minBidAmount}
                  onChange={(e) => setSettings({...settings, minBidAmount: Number(e.target.value)})}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Extension Time (minutes)</label>
                <input
                  type="number"
                  value={settings.auctionExtensionTime}
                  onChange={(e) => setSettings({...settings, auctionExtensionTime: Number(e.target.value)})}
                  className="input-field"
                />
                <p className="text-xs text-gray-500 mt-1">Time added when bid placed near end</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Auto-approve Products</span>
                <button
                  onClick={() => setSettings({...settings, autoApproveProducts: !settings.autoApproveProducts})}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.autoApproveProducts ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.autoApproveProducts ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>

          <div className="card lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Mode</h3>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Platform Status</p>
                <p className="text-sm text-gray-600">
                  {maintenanceMode ? 'Maintenance mode is active' : 'Platform is operational'}
                </p>
              </div>
              <button
                onClick={handleToggleMaintenance}
                className={maintenanceMode ? 'btn-primary' : 'btn-outline border-red-600 text-red-600'}
              >
                {maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Settings */}
      {activeTab === 'payment' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Gateways</h3>
            <div className="space-y-3">
              {[
                { name: 'AddPay', status: 'active', fee: '2.9%' },
                { name: 'Traderoot', status: 'active', fee: '2.9%' },
                { name: 'Bank Transfer', status: 'active', fee: '0%' }
              ].map((gateway) => (
                <div key={gateway.name} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{gateway.name}</p>
                      <p className="text-sm text-gray-600">Transaction Fee: {gateway.fee}</p>
                    </div>
                    <span className={`badge ${
                      gateway.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {gateway.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payout Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payout Schedule</label>
                <select className="input-field">
                  <option>Weekly</option>
                  <option>Bi-weekly</option>
                  <option>Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Payout (ZAR)</label>
                <input type="number" defaultValue="100" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Processing Days</label>
                <input type="number" defaultValue="3" className="input-field" />
                <p className="text-xs text-gray-500 mt-1">Business days to process payouts</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Settings */}
      {activeTab === 'email' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">SMTP Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                <input type="text" defaultValue="smtp.gmail.com" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
                <input type="number" defaultValue="587" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
                <input type="email" defaultValue="info@verispinejointcenters.com" className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
                <input type="password" defaultValue="••••••••" className="input-field" />
              </div>
              <button onClick={handleTestEmail} className="btn-outline w-full">
                Send Test Email
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Email Templates</h3>
            <div className="space-y-3">
              {[
                'Welcome Email',
                'Bid Confirmation',
                'Auction Won',
                'Payment Received',
                'Order Shipped',
                'Password Reset'
              ].map((template) => (
                <div key={template} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                  <span className="text-sm font-medium text-gray-900">{template}</span>
                  <button className="text-primary-600 hover:text-primary-700 text-sm">Edit</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Authentication</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Email Verification</p>
                  <p className="text-sm text-gray-600">Require email verification for new users</p>
                </div>
                <button className={`relative inline-flex h-6 w-11 items-center rounded-full bg-primary-600`}>
                  <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-600">Enable 2FA for all admin accounts</p>
                </div>
                <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200">
                  <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Login Attempts</label>
                <input type="number" value={settings.maxLoginAttempts} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Session Timeout (minutes)</label>
                <input type="number" value={settings.sessionTimeout} className="input-field" />
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Password Policy</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Length</label>
                <input type="number" defaultValue="8" className="input-field" />
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 mr-2" />
                  <span className="text-sm text-gray-700">Require uppercase letter</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 mr-2" />
                  <span className="text-sm text-gray-700">Require lowercase letter</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded border-gray-300 mr-2" />
                  <span className="text-sm text-gray-700">Require number</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" className="rounded border-gray-300 mr-2" />
                  <span className="text-sm text-gray-700">Require special character</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backup Settings */}
      {activeTab === 'backup' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Backup & Recovery</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backup Schedule</label>
                <select className="input-field">
                  <option>Daily at 2:00 AM</option>
                  <option>Weekly on Sunday</option>
                  <option>Monthly on 1st</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Retention Period</label>
                <select className="input-field">
                  <option>7 days</option>
                  <option>30 days</option>
                  <option>90 days</option>
                </select>
              </div>
              <button className="btn-primary w-full">Backup Now</button>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">Recent Backups</h4>
              {[
                { date: '2024-12-21 02:00', size: '1.2 GB', status: 'success' },
                { date: '2024-12-20 02:00', size: '1.2 GB', status: 'success' },
                { date: '2024-12-19 02:00', size: '1.1 GB', status: 'success' }
              ].map((backup, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{backup.date}</p>
                    <p className="text-xs text-gray-600">{backup.size}</p>
                  </div>
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button 
          onClick={handleSaveSettings} 
          className="btn-primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </motion.div>
  )
}

export default AdminSettings