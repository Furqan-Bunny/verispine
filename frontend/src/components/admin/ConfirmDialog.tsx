import { ReactNode, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface Props {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  /** If set, the user must type this exact text (e.g. "DELETE") to enable the confirm button. */
  requireText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Reusable destructive-action confirmation modal. Matches the AdminProducts delete-modal styling.
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', requireText, loading, onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState('')
  useEffect(() => { if (!open) setTyped('') }, [open])
  if (!open) return null

  const canConfirm = !requireText || typed === requireText

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl p-6 max-w-md w-full"
      >
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">{title}</h3>
        <div className="text-sm text-gray-600 text-center mb-4">{message}</div>
        {requireText && (
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`Type ${requireText} to confirm`}
            className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
