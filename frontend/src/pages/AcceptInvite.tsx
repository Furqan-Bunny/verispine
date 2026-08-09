import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import LoadingSpinner from '../components/LoadingSpinner'

const AcceptInvite = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  
  const token = searchParams.get('token')
  const referrerId = searchParams.get('referrer')

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link')
      setLoading(false)
      return
    }

    acceptInvitation()
  }, [token])

  const acceptInvitation = async () => {
    try {
      const response = await axios.post('/api/affiliate/accept-invite', {
        token,
        referrerId
      })

      setSuccess(true)
      toast.success('Invitation accepted successfully!')
      
      // Redirect to register page with referrer info
      setTimeout(() => {
        navigate(`/register?referrer=${referrerId || ''}`)
      }, 2000)
    } catch (error: any) {
      console.error('Error accepting invite:', error)
      setError(error.response?.data?.error || 'Failed to accept invitation')
      toast.error('Failed to accept invitation')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingSpinner message="Processing invitation..." />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {success ? (
            <>
              <CheckCircleIcon className="mx-auto h-16 w-16 text-green-500" />
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Invitation Accepted!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Redirecting you to registration page...
              </p>
            </>
          ) : (
            <>
              <XCircleIcon className="mx-auto h-16 w-16 text-red-500" />
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                Invalid Invitation
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {error || 'This invitation link is invalid or has expired.'}
              </p>
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => navigate('/register')}
                  className="w-full btn-primary"
                >
                  Register Without Invite
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full btn-outline"
                >
                  Go to Home
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AcceptInvite