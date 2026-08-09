import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import AdminLayout from './AdminLayout'
import LoadingSpinner from './LoadingSpinner'

const AdminRoute = () => {
  const { isAuthenticated, user, isLoading, token } = useAuthStore()

  // Only show loading if we're actually loading and don't have a token
  if (isLoading && !token) {
    return <LoadingSpinner message="Loading admin panel..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <AdminLayout />
}

export default AdminRoute