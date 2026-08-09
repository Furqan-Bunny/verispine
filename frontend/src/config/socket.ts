import io from 'socket.io-client'

// Get the socket URL based on environment
const getSocketUrl = () => {
  // In production (Railway), use the same domain as frontend
  // Socket.io will connect to the same domain without any path
  if (import.meta.env.PROD) {
    return window.location.origin
  }

  // In development, use environment variable or localhost
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  // Remove /api from the end to get the base backend URL
  return apiUrl.replace(/\/api$/, '')
}

export const createSocket = () => {
  const socketUrl = getSocketUrl()
  console.log('Connecting to socket at:', socketUrl)

  return io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  })
}

export default createSocket