import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../config/firebase'

// Helper to wait for auth to be initialized
export const waitForAuth = (): Promise<any> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

// Helper to get current auth state
export const getCurrentAuthState = () => {
  const token = localStorage.getItem('token')
  const user = localStorage.getItem('user')
  
  if (token && user) {
    try {
      return {
        token,
        user: JSON.parse(user),
        isAuthenticated: true
      }
    } catch (error) {
      console.error('Error parsing stored auth:', error)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  }
  
  return {
    token: null,
    user: null,
    isAuthenticated: false
  }
}

// Helper to persist auth state
export const persistAuth = (token: string, user: any) => {
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
}

// Helper to clear auth state
export const clearAuth = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}