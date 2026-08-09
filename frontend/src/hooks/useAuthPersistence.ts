import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../config/firebase'

export const useAuthPersistence = () => {
  const { user, token } = useAuthStore()

  useEffect(() => {
    // Sync auth state with localStorage whenever it changes
    if (user && token) {
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
    }
  }, [user, token])

  useEffect(() => {
    // Handle browser refresh - restore from sessionStorage as backup
    const handleBeforeUnload = () => {
      if (user && token) {
        sessionStorage.setItem('quicksell_token', token)
        sessionStorage.setItem('quicksell_user', JSON.stringify(user))
      }
    }

    const handleLoad = () => {
      // Try to restore from sessionStorage if localStorage is empty
      const localToken = localStorage.getItem('token')
      if (!localToken) {
        const sessionToken = sessionStorage.getItem('quicksell_token')
        const sessionUser = sessionStorage.getItem('quicksell_user')
        
        if (sessionToken && sessionUser) {
          localStorage.setItem('token', sessionToken)
          localStorage.setItem('user', sessionUser)
          
          // Clear session storage after restoring
          sessionStorage.removeItem('quicksell_token')
          sessionStorage.removeItem('quicksell_user')
          
          // Reload to reinitialize auth
          window.location.reload()
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('load', handleLoad)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('load', handleLoad)
    }
  }, [user, token])
}