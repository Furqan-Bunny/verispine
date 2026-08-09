import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { verifyTraderootPayment, verifyTraderootTopup } from '../services/traderootService'
import toast from 'react-hot-toast'

/**
 * Traderoot e-Commerce Immediate Payment callback. The whole payment (card + 3-D Secure + settle)
 * happens on a single Traderoot-hosted page; we land here afterwards with a base64 `data` param
 * describing the outcome. Settlement is driven by the server-to-server notification webhook; this
 * page just confirms via the verify endpoint and routes the user to success/cancel.
 */
const TraderootCallback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'error'>('processing')
  const [message, setMessage] = useState('Confirming your payment...')

  const orderId = searchParams.get('orderId')
  const topupId = searchParams.get('topupId')
  const b64Data = searchParams.get('data')

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    // Decode the base64 callback data from Traderoot (outcome of the hosted-page journey)
    let callbackData: any = null
    if (b64Data) {
      try {
        callbackData = JSON.parse(atob(b64Data))
      } catch {
        console.warn('Could not decode Traderoot callback data')
      }
    }

    const isTopup = !!topupId
    const cancelRoute = isTopup ? '/wallet?topup=cancelled' : '/payment/cancel'

    // Declined / non-approval on the hosted page
    if (callbackData && callbackData.responseCode && callbackData.responseCode !== '00') {
      setStatus('error')
      setMessage(callbackData.responseMessage || 'Payment was declined')
      toast.error(callbackData.responseMessage || 'Payment declined')
      setTimeout(() => navigate(cancelRoute, { state: { error: callbackData.responseMessage } }), 2000)
      return
    }

    if (!orderId && !topupId) {
      setStatus('error')
      setMessage('Missing payment reference')
      setTimeout(() => navigate('/'), 2000)
      return
    }

    try {
      if (isTopup) {
        const result = await verifyTraderootTopup(topupId!, callbackData)
        if (result.success) {
          toast.success('Wallet top-up successful!')
          navigate('/wallet?topup=success', { replace: true })
          return
        }
        // Approved on the hosted page but not yet settled — the notification webhook will credit
        // the wallet; the wallet page shows "balance will update shortly" and refreshes.
        navigate('/wallet?topup=success', { replace: true })
        return
      }

      const result = await verifyTraderootPayment(orderId!, callbackData)
      if (result.success) {
        toast.success('Payment successful!')
        navigate(`/payment/success?order_id=${orderId}&method=traderoot`, { replace: true })
        return
      }
      // Approved on the hosted page but settlement not yet recorded — the success page re-verifies.
      navigate(`/payment/success?order_id=${orderId}&method=traderoot&pending=1`, { replace: true })
    } catch (error: any) {
      console.error('Traderoot callback error:', error)
      setStatus('error')
      setMessage(error.response?.data?.error || 'Payment confirmation failed')
      toast.error('Payment confirmation failed')
      setTimeout(() => navigate(cancelRoute), 3000)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      {status === 'processing' ? (
        <>
          <div className="loading-spinner mb-4" />
          <h2 className="text-lg font-semibold text-gray-900">{message}</h2>
          <p className="text-sm text-gray-500 mt-2">Please wait, do not close this page...</p>
        </>
      ) : (
        <>
          <div className="text-red-500 text-4xl mb-4">!</div>
          <h2 className="text-lg font-semibold text-red-700">{message}</h2>
          <p className="text-sm text-gray-500 mt-2">Redirecting...</p>
        </>
      )}
    </div>
  )
}

export default TraderootCallback
