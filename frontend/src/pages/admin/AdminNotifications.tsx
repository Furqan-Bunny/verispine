import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import axios from '../../config/axios'
import {
  BellIcon,
  PlusCircleIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  CalendarIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon,
  ChartBarIcon,
  UsersIcon,
  EnvelopeIcon,
  InformationCircleIcon,
  XMarkIcon,
  DocumentPlusIcon,
  ClipboardDocumentListIcon,
  ChartPieIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'
import { usePagination } from '../../hooks/usePagination'
import PaginationBar from '../../components/admin/PaginationBar'

// TypeScript Interfaces
interface NotificationTemplate {
  id: string
  name: string
  title: string
  content: string
  type: 'info' | 'warning' | 'success' | 'error'
  variables: string[]
  createdAt: string
  updatedAt: string
  usageCount: number
}

interface NotificationHistory {
  id: string
  title: string
  content: string
  type: 'info' | 'warning' | 'success' | 'error'
  audience: 'all' | 'sellers' | 'buyers' | 'specific'
  recipientCount: number
  sentAt: string
  readCount: number
  clickCount: number
  readRate: number
  clickRate: number
  status: 'sent' | 'scheduled' | 'draft' | 'failed'
  templateId?: string
  createdBy: string
}

interface NotificationStats {
  totalSent: number
  totalRecipients: number
  avgReadRate: number
  todaySent: number
  weekSent: number
  monthSent: number
  topPerformingType: string
  recentActivity: {
    date: string
    sent: number
    opened: number
  }[]
}

interface SendNotificationForm {
  title: string
  content: string
  type: 'info' | 'warning' | 'success' | 'error'
  audience: 'all' | 'sellers' | 'buyers' | 'specific'
  specificUserIds: string[]
  scheduleDate?: string
  templateId?: string
}

const AdminNotifications = () => {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('send')
  const [loading, setLoading] = useState(false)
  
  // Send notifications state
  const [sendForm, setSendForm] = useState<SendNotificationForm>({
    title: '',
    content: '',
    type: 'info',
    audience: 'all',
    specificUserIds: []
  })
  const [sendingNotification, setSendingNotification] = useState(false)
  
  // History state
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [historyFilter, setHistoryFilter] = useState('all')
  
  // Templates state
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templateForm, setTemplateForm] = useState<{
    name: string
    title: string
    content: string
    type: 'info' | 'warning' | 'success' | 'error'
    variables: string[]
  }>({
    name: '',
    title: '',
    content: '',
    type: 'info',
    variables: []
  })
  
  // Statistics state
  const [stats, setStats] = useState<NotificationStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Audience counts state
  const [audienceCounts, setAudienceCounts] = useState<{ all: number; sellers: number; buyers: number }>({ all: 0, sellers: 0, buyers: 0 })
  
  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    if (activeTab === 'history') {
      loadNotificationHistory()
    } else if (activeTab === 'templates') {
      loadTemplates()
    } else if (activeTab === 'statistics') {
      loadStatistics()
    }
  }, [activeTab])

  const loadAudienceCounts = async () => {
    try {
      const response = await axios.get('/api/admin-ext/notifications/audience-counts')
      if (response.data.success) {
        setAudienceCounts(response.data.data)
      }
    } catch (error) {
      console.error('Error loading audience counts:', error)
    }
  }

  const loadInitialData = async () => {
    setLoading(true)
    try {
      // Load stats, templates, and audience counts in parallel
      await Promise.all([
        loadStatistics(),
        loadTemplates(),
        loadAudienceCounts()
      ])
    } catch (error) {
      console.error('Error loading initial data:', error)
      toast.error('Error loading dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Send Notifications Functions
  const handleSendNotification = async () => {
    if (!sendForm.title.trim() || !sendForm.content.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    setSendingNotification(true)
    try {
      const payload = {
        title: sendForm.title,
        message: sendForm.content,
        type: sendForm.type,
        audience: sendForm.audience,
        userIds: sendForm.specificUserIds,
        ...(sendForm.scheduleDate ? { scheduleDate: sendForm.scheduleDate } : {}),
        ...(sendForm.templateId ? { templateId: sendForm.templateId } : {})
      }
      const response = await axios.post('/api/admin-ext/notifications/send', payload)
      
      if (response.data.success) {
        toast.success('Notification sent successfully')
        setSendForm({
          title: '',
          content: '',
          type: 'info',
          audience: 'all',
          specificUserIds: []
        })
        // Refresh stats
        loadStatistics()
      } else {
        toast.error(response.data.message || 'Failed to send notification')
      }
    } catch (error: any) {
      console.error('Error sending notification:', error)
      toast.error(error.response?.data?.message || 'Error sending notification')
    } finally {
      setSendingNotification(false)
    }
  }

  const useTemplate = (template: NotificationTemplate) => {
    setSendForm(prev => ({
      ...prev,
      title: template.title || (template as any).subject || '',
      content: template.content || (template as any).body || '',
      type: template.type,
      templateId: template.id
    }))
    setActiveTab('send')
    toast.success('Template loaded into form')
  }

  // History Functions
  const loadNotificationHistory = async () => {
    setHistoryLoading(true)
    try {
      const response = await axios.get('/api/admin-ext/notifications/history')

      if (response.data.success) {
        const mapped = (response.data.data || []).map((n: any) => ({
          id: n.id || '',
          title: n.title || '',
          content: n.content || n.message || '',
          type: n.type || 'info',
          audience: n.audience || 'all',
          recipientCount: n.recipientCount || 0,
          sentAt: n.sentAt || n.createdAt || '',
          readCount: n.readCount || 0,
          clickCount: n.clickCount || 0,
          readRate: n.readRate || 0,
          clickRate: n.clickRate || 0,
          status: n.status || 'sent',
          templateId: n.templateId,
          createdBy: n.createdBy || ''
        }))
        setNotificationHistory(mapped)
      } else {
        toast.error('Failed to load notification history')
      }
    } catch (error) {
      console.error('Error loading notification history:', error)
      toast.error('Error loading notification history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const filteredHistory = notificationHistory.filter(notification => {
    const matchesSearch = notification.title.toLowerCase().includes(historySearch.toLowerCase()) ||
                         notification.content.toLowerCase().includes(historySearch.toLowerCase())
    
    const matchesFilter = historyFilter === 'all' || 
                         notification.type === historyFilter ||
                         notification.status === historyFilter ||
                         notification.audience === historyFilter
    
    return matchesSearch && matchesFilter
  })

  // Templates Functions
  const loadTemplates = async () => {
    setTemplatesLoading(true)
    try {
      const response = await axios.get('/api/admin-ext/notifications/templates')
      
      if (response.data.success) {
        setTemplates(response.data.data)
      } else {
        toast.error('Failed to load templates')
      }
    } catch (error) {
      console.error('Error loading templates:', error)
      toast.error('Error loading templates')
    } finally {
      setTemplatesLoading(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.title.trim() || !templateForm.content.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      const payload = {
        name: templateForm.name,
        type: templateForm.type,
        subject: templateForm.title,
        body: templateForm.content,
        title: templateForm.title,
        content: templateForm.content,
        variables: extractVariables(templateForm.content)
      }

      if (editingTemplate) {
        // Update existing template
        const response = await axios.put(`/api/admin-ext/notifications/templates/${editingTemplate.id}`, payload)
        
        if (response.data.success) {
          toast.success('Template updated successfully')
          setEditingTemplate(null)
          setShowTemplateModal(false)
          loadTemplates()
        } else {
          toast.error('Failed to update template')
        }
      } else {
        // Create new template
        const response = await axios.post('/api/admin-ext/notifications/templates', payload)
        
        if (response.data.success) {
          toast.success('Template created successfully')
          setShowTemplateModal(false)
          loadTemplates()
        } else {
          toast.error('Failed to create template')
        }
      }

      // Reset form
      setTemplateForm({
        name: '',
        title: '',
        content: '',
        type: 'info',
        variables: []
      })
    } catch (error: any) {
      console.error('Error saving template:', error)
      toast.error(error.response?.data?.message || 'Error saving template')
    }
  }

  // Hard-delete one or many templates via the admin bulk-delete endpoint.
  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('notification-templates', ids)
      setTemplates(prev => prev.filter((r: any) => !ids.includes(r.id)))
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Deleted ${res.deleted}`)
      sel.clear()
      setRowToDelete(null)
      setBulkOpen(false)
      loadTemplates()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const editTemplate = (template: NotificationTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      title: template.title || (template as any).subject || '',
      content: template.content || (template as any).body || '',
      type: template.type,
      variables: template.variables || []
    })
    setShowTemplateModal(true)
  }

  const extractVariables = (content: string): string[] => {
    const matches = content.match(/\{\{([^}]+)\}\}/g)
    if (!matches) return []
    
    return matches.map(match => match.replace(/[{}]/g, '')).filter((value, index, self) => self.indexOf(value) === index)
  }

  // Statistics Functions
  const loadStatistics = async () => {
    setStatsLoading(true)
    try {
      const response = await axios.get('/api/admin-ext/notifications/stats')

      if (response.data.success) {
        const d = response.data.data
        setStats({
          totalSent: d.totalSent || 0,
          totalRecipients: d.totalRecipients || 0,
          avgReadRate: d.avgReadRate ?? d.readRate ?? 0,
          todaySent: d.todaySent || 0,
          weekSent: d.weekSent || 0,
          monthSent: d.monthSent || 0,
          topPerformingType: d.topPerformingType || 'info',
          recentActivity: (d.recentActivity || []).map((a: any) => ({
            date: a.date,
            sent: a.sent || 0,
            opened: a.opened || 0
          }))
        })
      } else {
        toast.error('Failed to load statistics')
      }
    } catch (error) {
      console.error('Error loading statistics:', error)
      toast.error('Error loading statistics')
    } finally {
      setStatsLoading(false)
    }
  }

  // Utility Functions
  const getTypeBadgeClasses = (type: string) => {
    const classes = {
      info: 'bg-blue-100 text-blue-800',
      warning: 'bg-yellow-100 text-yellow-800',
      success: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800'
    }
    return classes[type as keyof typeof classes] || classes.info
  }

  const getStatusBadgeClasses = (status: string) => {
    const classes = {
      sent: 'bg-green-100 text-green-800',
      scheduled: 'bg-blue-100 text-blue-800',
      draft: 'bg-gray-100 text-gray-800',
      failed: 'bg-red-100 text-red-800'
    }
    return classes[status as keyof typeof classes] || classes.draft
  }

  const getTypeIcon = (type: string) => {
    const icons = {
      info: InformationCircleIcon,
      warning: ExclamationTriangleIcon,
      success: CheckCircleIcon,
      error: XMarkIcon
    }
    return icons[type as keyof typeof icons] || InformationCircleIcon
  }

  const formatDate = (dateValue: any) => {
    if (!dateValue) return '-'
    // Handle Firestore timestamp objects
    if (dateValue._seconds || dateValue.seconds) {
      const seconds = dateValue._seconds || dateValue.seconds
      return new Date(seconds * 1000).toLocaleString()
    }
    // Handle ISO strings or Date objects
    const date = new Date(dateValue)
    return isNaN(date.getTime()) ? '-' : date.toLocaleString()
  }

  const getEstimatedReach = () => {
    if (sendForm.audience === 'specific') return sendForm.specificUserIds.length
    return audienceCounts[sendForm.audience] || 0
  }

  const {
    paginatedItems: paginatedTemplates,
    currentPage: templatesPage,
    totalPages: templatesTotalPages,
    totalItems: templatesTotalItems,
    startIndex: templatesStartIndex,
    endIndex: templatesEndIndex,
    setCurrentPage: setTemplatesPage
  } = usePagination({
    data: templates,
    itemsPerPage: 20
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header with Stats Overview */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BellIcon className="h-8 w-8 text-blue-600" />
            Notifications Management
          </h1>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Sent</p>
                <p className="text-2xl font-bold text-blue-900">
                  {stats?.totalSent || 0}
                </p>
              </div>
              <PaperAirplaneIcon className="h-10 w-10 text-blue-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Avg Read Rate</p>
                <p className="text-2xl font-bold text-green-900">
                  {stats?.avgReadRate ? `${stats.avgReadRate.toFixed(1)}%` : '0%'}
                </p>
              </div>
              <EyeIcon className="h-10 w-10 text-green-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600">This Month</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {stats?.monthSent || 0}
                </p>
              </div>
              <CalendarIcon className="h-10 w-10 text-yellow-500" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Templates</p>
                <p className="text-2xl font-bold text-purple-900">
                  {templates.length}
                </p>
              </div>
              <ClipboardDocumentListIcon className="h-10 w-10 text-purple-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide px-6">
            {[
              { key: 'send', label: 'Send Notification', icon: PaperAirplaneIcon },
              { key: 'history', label: 'History', icon: ClockIcon },
              { key: 'templates', label: 'Templates', icon: ClipboardDocumentListIcon },
              { key: 'statistics', label: 'Statistics', icon: ChartPieIcon }
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Send Notification Tab */}
          {activeTab === 'send' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Form */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <DocumentPlusIcon className="h-5 w-5" />
                  Compose Notification
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={sendForm.title}
                      onChange={(e) => setSendForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter notification title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message *
                    </label>
                    <textarea
                      value={sendForm.content}
                      onChange={(e) => setSendForm(prev => ({ ...prev, content: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 h-32 resize-none"
                      placeholder="Enter notification message"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Type
                      </label>
                      <select
                        value={sendForm.type}
                        onChange={(e) => setSendForm(prev => ({ ...prev, type: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="info">Information</option>
                        <option value="warning">Warning</option>
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Audience
                      </label>
                      <select
                        value={sendForm.audience}
                        onChange={(e) => setSendForm(prev => ({ ...prev, audience: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Users</option>
                        <option value="sellers">Sellers Only</option>
                        <option value="buyers">Buyers Only</option>
                        <option value="specific">Specific Users</option>
                      </select>
                    </div>
                  </div>

                  {sendForm.audience === 'specific' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        User IDs (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={sendForm.specificUserIds.join(', ')}
                        onChange={(e) => setSendForm(prev => ({ 
                          ...prev, 
                          specificUserIds: e.target.value.split(',').map(id => id.trim()).filter(id => id)
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter user IDs separated by commas"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Schedule (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={sendForm.scheduleDate || ''}
                      onChange={(e) => setSendForm(prev => ({ ...prev, scheduleDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSendNotification}
                      disabled={sendingNotification}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {sendingNotification ? 'Sending...' : (sendForm.scheduleDate ? 'Schedule' : 'Send Now')}
                    </button>
                    
                    <button 
                      onClick={() => setSendForm({
                        title: '',
                        content: '',
                        type: 'info',
                        audience: 'all',
                        specificUserIds: []
                      })}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <EyeIcon className="h-5 w-5" />
                  Preview
                </h3>
                
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${getTypeBadgeClasses(sendForm.type)}`}>
                      {(() => {
                        const Icon = getTypeIcon(sendForm.type)
                        return <Icon className="h-5 w-5" />
                      })()}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900">
                        {sendForm.title || 'Notification Title'}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {sendForm.content || 'Your notification message will appear here...'}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span>To: {sendForm.audience === 'all' ? 'All Users' : 
                                     sendForm.audience === 'sellers' ? 'Sellers' :
                                     sendForm.audience === 'buyers' ? 'Buyers' : 'Specific Users'}</span>
                        <span>Type: {sendForm.type}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Delivery Estimate</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Recipients</span>
                      <span className="font-medium">{getEstimatedReach()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Expected Read Rate</span>
                      <span className="font-medium">{stats?.avgReadRate ? `${stats.avgReadRate.toFixed(1)}%` : '75%'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivery Time</span>
                      <span className="font-medium">
                        {sendForm.scheduleDate ? 'Scheduled' : 'Immediate'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Templates */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Quick Templates</h4>
                  <div className="space-y-2">
                    {templates.slice(0, 3).map(template => (
                      <button
                        key={template.id}
                        onClick={() => useTemplate(template)}
                        className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeBadgeClasses(template.type)}`}>
                            {template.type}
                          </span>
                          <span className="font-medium text-sm">{template.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-between">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ClockIcon className="h-5 w-5" />
                  Notification History
                </h3>
                
                <div className="flex gap-3">
                  <div className="relative">
                    <MagnifyingGlassIcon className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Search notifications..."
                    />
                  </div>
                  
                  <select
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                    <option value="sent">Sent</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="overflow-hidden bg-white border border-gray-200 rounded-lg">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notification</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Audience</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metrics</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredHistory.map((notification) => (
                          <tr key={notification.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-gray-900">{notification.title}</p>
                                <p className="text-sm text-gray-600 truncate max-w-xs">{notification.content}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadgeClasses(notification.type)}`}>
                                {notification.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{notification.audience}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClasses(notification.status)}`}>
                                {notification.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {notification.sentAt ? formatDate(notification.sentAt) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="space-y-1">
                                <div className="text-gray-900">
                                  {notification.readRate.toFixed(1)}% read
                                </div>
                                <div className="text-gray-600">
                                  {notification.readCount}/{notification.recipientCount} opened
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {filteredHistory.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        {historySearch || historyFilter !== 'all' 
                          ? 'No notifications match your search criteria'
                          : 'No notifications sent yet'
                        }
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardDocumentListIcon className="h-5 w-5" />
                  Notification Templates
                </h3>
                
                <div className="flex items-center gap-3">
                  {templates.length > 0 && (
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={sel.allSelected(paginatedTemplates.map(t => t.id))}
                        onChange={() => sel.toggleAll(paginatedTemplates.map(t => t.id))}
                        className="rounded border-gray-300"
                      />
                      Select all
                    </label>
                  )}
                  <button
                    onClick={() => {
                      setEditingTemplate(null)
                      setTemplateForm({
                        name: '',
                        title: '',
                        content: '',
                        type: 'info',
                        variables: []
                      })
                      setShowTemplateModal(true)
                    }}
                    className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 flex items-center gap-2"
                  >
                    <PlusCircleIcon className="h-4 w-4" />
                    New Template
                  </button>
                </div>
              </div>

              <BulkDeleteBar
                count={sel.selected.length}
                onDelete={() => setBulkOpen(true)}
                onClear={sel.clear}
                label="template"
              />

              {templatesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedTemplates.map((template) => (
                    <div key={template.id} className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${sel.isSelected(template.id) ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={sel.isSelected(template.id)}
                            onChange={() => sel.toggle(template.id)}
                            className="rounded border-gray-300"
                          />
                          <div className={`p-2 rounded-lg ${getTypeBadgeClasses(template.type)}`}>
                            {(() => {
                              const Icon = getTypeIcon(template.type)
                              return <Icon className="h-4 w-4" />
                            })()}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => editTemplate(template)}
                            className="p-1 text-gray-400 hover:text-blue-600"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setRowToDelete(template.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      <h4 className="font-semibold text-gray-900 mb-1">{template.name}</h4>
                      <p className="text-sm text-gray-600 mb-2">{template.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{template.content}</p>
                      
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeBadgeClasses(template.type)}`}>
                          {template.type}
                        </span>
                        <button
                          onClick={() => useTemplate(template)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Use Template
                        </button>
                      </div>
                      
                      {template.variables.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500">
                            Variables: {template.variables.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!templatesLoading && (
                <PaginationBar
                  total={templatesTotalItems}
                  start={templatesStartIndex}
                  end={templatesEndIndex}
                  currentPage={templatesPage}
                  totalPages={templatesTotalPages}
                  onPageChange={setTemplatesPage}
                  label="template"
                />
              )}

              {templates.length === 0 && !templatesLoading && (
                <div className="text-center py-8 text-gray-500">
                  No templates created yet. Create your first template to get started.
                </div>
              )}
            </div>
          )}

          {/* Statistics Tab */}
          {activeTab === 'statistics' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ChartPieIcon className="h-5 w-5" />
                Notification Analytics
              </h3>

              {statsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : stats ? (
                <>
                  {/* Detailed Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total Recipients</p>
                          <p className="text-2xl font-bold text-gray-900">{(stats.totalRecipients || 0).toLocaleString()}</p>
                        </div>
                        <UsersIcon className="h-8 w-8 text-blue-500" />
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Avg Read Rate</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.avgReadRate?.toFixed(1) || '0'}%</p>
                        </div>
                        <ChartBarIcon className="h-8 w-8 text-green-500" />
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">This Week</p>
                          <p className="text-2xl font-bold text-gray-900">{stats.weekSent || 0}</p>
                        </div>
                        <CalendarIcon className="h-8 w-8 text-yellow-500" />
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Top Performing</p>
                          <p className="text-lg font-bold text-gray-900 capitalize">{stats.topPerformingType || 'N/A'}</p>
                        </div>
                        <CheckCircleIcon className="h-8 w-8 text-purple-500" />
                      </div>
                    </div>
                  </div>

                  {/* Activity Chart Placeholder */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h4>
                    
                    {stats.recentActivity && stats.recentActivity.length > 0 ? (
                      <div className="space-y-4">
                        {stats.recentActivity.slice(0, 7).map((activity, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-900">{activity.date}</p>
                              <p className="text-sm text-gray-600">
                                {activity.sent} sent • {activity.opened} read
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">
                                {activity.sent > 0 ? ((activity.opened / activity.sent) * 100).toFixed(1) : 0}% open rate
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No recent activity data available
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Unable to load statistics
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Single delete confirmation */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete template?"
        message="This permanently deletes the notification template. This action cannot be undone."
        loading={deleting}
        onConfirm={() => rowToDelete && doDelete([rowToDelete])}
        onCancel={() => setRowToDelete(null)}
      />

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} template(s)?`}
        message="This permanently deletes the selected notification templates. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingTemplate ? 'Edit Template' : 'Create New Template'}
                </h3>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter template name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={templateForm.title}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter notification title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content *
                </label>
                <textarea
                  value={templateForm.content}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 h-32 resize-none"
                  placeholder="Enter notification content. Use {{variable}} for dynamic content."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use double curly braces for variables: {'{{username}}, {{amount}}, etc.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={templateForm.type}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="info">Information</option>
                  <option value="warning">Warning</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>
              </div>

              {extractVariables(templateForm.content).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Detected Variables
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {extractVariables(templateForm.content).map(variable => (
                      <span
                        key={variable}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded"
                      >
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default AdminNotifications