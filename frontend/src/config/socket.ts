import io from 'socket.io-client'

/**
 * Backend origin for the websocket.
 *
 * This must be the API host, not the page host. The frontend is deployed
 * separately from the backend (static hosting vs Railway), so the previous
 * `window.location.origin` in production pointed the socket at a server that
 * doesn't exist there — live bidding fell back to polling forever and nobody saw
 * a connection error.
 */
const getSocketUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000'
  // VITE_API_URL may or may not include the /api suffix; the socket wants the root.
  return apiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')
}

export const createSocket = () => {
  const socketUrl = getSocketUrl()

  return io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    /**
     * Read at every (re)connection rather than captured once, so a socket opened
     * before login picks up the token on reconnect instead of staying anonymous.
     * The server resolves this to a uid at handshake; bidding requires it.
     */
    auth: (cb: (data: { token: string }) => void) => {
      cb({ token: localStorage.getItem('token') || '' })
    },
  })
}

export default createSocket
