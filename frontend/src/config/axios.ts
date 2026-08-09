import axios from 'axios'

// In development, Vite's proxy handles /api/* requests (see vite.config.ts)
// In production, frontend and backend are on the same domain
// So we don't need to modify URLs - just use relative paths like /api/products

// Request interceptor to add auth token only
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor — on 401 the token is invalid/expired: clear it and send the user to
// login (matches services/api.ts so both axios instances behave consistently). Guarded against
// a redirect loop when already on the login page.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    console.error('API Error:', error.response?.status, error.response?.data)
    return Promise.reject(error)
  }
)

export default axios