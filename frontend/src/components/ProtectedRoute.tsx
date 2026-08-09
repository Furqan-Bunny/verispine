import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import LoadingSpinner from './LoadingSpinner'

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading, token, user } = useAuthStore()

  // Only show loading if we're actually loading and don't have a token
  // This prevents unnecessary loading states when auth is already in localStorage
  if (isLoading && !token) {
    return <LoadingSpinner message="Checking authentication..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Block unverified users from accessing protected routes
  if (user && !user.emailVerified) {
    return <Navigate to="/verify-email" state={{ email: user.email }} replace />
  }

  return <Outlet />
}

export default ProtectedRoute