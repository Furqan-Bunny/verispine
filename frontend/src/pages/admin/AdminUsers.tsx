import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import axios from '../../config/axios'
import {
  UsersIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { usePagination } from '../../hooks/usePagination'
import PaginationBar from '../../components/admin/PaginationBar'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import { adminBulkDelete } from '../../services/adminDelete'

interface User {
  id: string
  uid: string
  name: string
  email: string
  role: string
  phone?: string
  location?: string
  profileImage?: string
  status: string
  createdAt: any
  lastLogin?: any
  totalOrders?: number
  totalSpent?: number
  watchlist?: string[]
  sellerProfile?: {
    verifiedSeller?: boolean
    businessName?: string
  }
}

const AdminUsers = () => {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState('all')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (user?.role !== 'admin') return
    loadUsers()
  }, [user])

  useEffect(() => {
    filterUsers()
  }, [searchTerm, selectedRole, users])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const response = await axios.get('/api/admin/users')
      if (response.data.success) {
        setUsers(response.data.data)
        setFilteredUsers(response.data.data)
      }
    } catch (error) {
      console.error('Error loading users:', error)
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const filterUsers = () => {
    let filtered = [...users]

    // Filter by role
    if (selectedRole !== 'all') {
      filtered = filtered.filter(u => u.role === selectedRole)
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    setFilteredUsers(filtered)
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const response = await axios.put(`/api/admin/users/${userId}/role`, { role: newRole })
      if (response.data.success) {
        toast.success('User role updated')
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, role: newRole } : u
        ))
      }
    } catch (error) {
      console.error('Error updating user role:', error)
      toast.error('Failed to update user role')
    }
  }

  const handleToggleVerified = async (userId: string, current: boolean) => {
    try {
      const response = await axios.put(`/api/admin/users/${userId}/verify-seller`, { verified: !current })
      if (response.data.success) {
        toast.success(!current ? 'Seller verified' : 'Verification removed')
        setUsers(prev => prev.map(u =>
          u.id === userId
            ? { ...u, sellerProfile: { ...(u.sellerProfile || {}), verifiedSeller: !current } }
            : u
        ))
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to update verification')
    }
  }

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('users', ids)
      setUsers(prev => prev.filter(u => !ids.includes(u.id)))
      if (res.failed?.length) toast.error(`${res.failed.length} could not be deleted: ${res.failed[0].reason}`)
      else toast.success(`Deleted ${res.deleted}`)
      sel.clear(); setRowToDelete(null); setBulkOpen(false)
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    const d = date._seconds ? new Date(date._seconds * 1000) : new Date(date)
    return d.toLocaleDateString()
  }

  // Pagination
  const {
    paginatedItems: paginatedUsers,
    currentPage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    setCurrentPage
  } = usePagination({ data: filteredUsers, itemsPerPage: 20, resetPageOn: [searchTerm, selectedRole] })

  const getRoleBadge = (role: string) => {
    const badges: Record<string, string> = {
      admin: 'bg-red-100 text-red-800',
      seller: 'bg-purple-100 text-purple-800',
      user: 'bg-gray-100 text-gray-800'
    }
    return badges[role] || 'bg-gray-100 text-gray-800'
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      suspended: 'bg-red-100 text-red-800',
      inactive: 'bg-yellow-100 text-yellow-800'
    }
    return badges[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl p-6 text-white">
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-primary-100 mt-2">
          Manage user accounts and permissions
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full input"
              />
            </div>
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="input"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="seller">Seller</option>
            <option value="user">User</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            </div>
            <UsersIcon className="h-8 w-8 text-primary-600" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Admins</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => u.role === 'admin').length}
              </p>
            </div>
            <ShieldCheckIcon className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sellers</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => u.role === 'seller').length}
              </p>
            </div>
            <UserCircleIcon className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">
                {users.filter(u => u.status === 'active').length}
              </p>
            </div>
            <CheckCircleIcon className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Users Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        label="user"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={sel.allSelected(paginatedUsers.map(u => u.id))}
                    onChange={() => sel.toggleAll(paginatedUsers.map(u => u.id))}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={sel.isSelected(user.id)}
                      onChange={() => sel.toggle(user.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <img
                        className="h-10 w-10 rounded-full"
                        src={user.profileImage || `https://ui-avatars.com/api/?name=${user.name}`}
                        alt={user.name}
                      />
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {user.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.email}</div>
                    {user.phone && (
                      <div className="text-sm text-gray-500">{user.phone}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className={`px-2 py-1 text-xs rounded-full font-medium ${getRoleBadge(user.role)}`}
                      >
                        <option value="user">User</option>
                        <option value="seller">Seller</option>
                        <option value="admin">Admin</option>
                      </select>
                      {user.role === 'seller' && (
                        <button
                          title={user.sellerProfile?.verifiedSeller ? 'Click to remove verification' : 'Click to verify seller'}
                          onClick={() => handleToggleVerified(user.id, !!user.sellerProfile?.verifiedSeller)}
                          className={`p-1 rounded ${user.sellerProfile?.verifiedSeller ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-300 hover:bg-gray-50 hover:text-blue-400'}`}
                        >
                          <ShieldCheckIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusBadge(user.status || 'active')}`}>
                      {user.status || 'active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(user.lastLogin)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user)
                          setShowEditModal(true)
                        }}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setRowToDelete(user.id)}
                        title="Delete"
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <PaginationBar
          total={totalItems}
          start={startIndex}
          end={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          label="user"
        />

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No users found</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Edit User: {selectedUser.name}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={selectedUser.email}
                  disabled
                  className="input bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={selectedUser.role}
                  onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
                  className="input"
                >
                  <option value="user">User</option>
                  <option value="seller">Seller</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={selectedUser.status || 'active'}
                  onChange={(e) => setSelectedUser({ ...selectedUser, status: e.target.value })}
                  className="input"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={async () => {
                    await handleRoleChange(selectedUser.id, selectedUser.role)
                    setShowEditModal(false)
                    setSelectedUser(null)
                  }}
                  className="btn-primary flex-1"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setSelectedUser(null)
                  }}
                  className="btn-outline flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete user?"
        message="This permanently deletes the user account. This action cannot be undone."
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} user${sel.selected.length > 1 ? 's' : ''}?`}
        message="This permanently deletes the selected user accounts. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </motion.div>
  )
}

export default AdminUsers