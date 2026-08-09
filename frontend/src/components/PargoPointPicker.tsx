import { useEffect, useRef, useState } from 'react'
import axios from '../config/axios'

export interface PargoPoint {
  code: string
  name?: string
  address?: string
  city?: string
  postalCode?: string
  province?: string
  lat?: number
  lng?: number
}

interface Props {
  selected: PargoPoint | null
  onSelect: (point: PargoPoint) => void
  /** Optional address string to centre the map on (e.g. the buyer's area). */
  address?: string
}

// Normalise the various shapes Pargo's map may post back into our PargoPoint.
function toPoint(raw: any): PargoPoint | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw.attributes || raw.address || raw
  const code = raw.pickupPointCode || raw.pointCode || raw.code || a.pickupPointCode || a.code
  if (!code) return null
  return {
    code: String(code),
    name: raw.short_store_name || raw.name || raw.storeName || a.short_store_name || a.name || '',
    address: a.address1 || a.address || raw.address1 || '',
    city: a.city || '',
    postalCode: a.postalCode || a.postal_code || '',
    province: a.province || '',
    lat: (a.coordinates && a.coordinates.lat) || a.lat || raw.lat,
    lng: (a.coordinates && a.coordinates.lng) || a.lng || raw.lng,
  }
}

/**
 * Pargo pickup-point selector. Embeds Pargo's hosted map (map.pargo.co.za) in an iframe and listens
 * for the point-selection postMessage. The map token is fetched from the backend so it isn't baked
 * into the bundle. The exact postMessage event shape is confirmed with Pargo (map.pargo.co.za/demo.html).
 */
export default function PargoPointPicker({ selected, onSelect, address }: Props) {
  const [token, setToken] = useState<string | null>(null)
  // The map host must match the token's environment (staging token -> map.staging.pargo.co.za,
  // live token -> map.pargo.co.za); the backend returns the right one based on PARGO_BASE_URL.
  const [mapBase, setMapBase] = useState('https://map.pargo.co.za')
  const [open, setOpen] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    axios.get('/api/shipping/pargo/map-token')
      .then(r => {
        setToken(r.data?.token || '')
        if (r.data?.mapUrl) setMapBase(String(r.data.mapUrl).replace(/\/+$/, ''))
      })
      .catch(() => setToken(''))
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MessageEvent) => {
      // Only trust messages from the Pargo map origin.
      if (typeof e.origin === 'string' && !e.origin.includes('pargo.co.za')) return
      const d: any = e.data
      // Pargo posts the selected point; be liberal about the wrapper key.
      const candidate = d && (d.pickupPoint || d.point || d.data || d)
      const point = toPoint(candidate)
      if (point) {
        onSelectRef.current(point)
        setOpen(false)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [open])

  const mapUrl = token
    ? `${mapBase}/?token=${encodeURIComponent(token)}${address ? `&address=${encodeURIComponent(address)}` : ''}`
    : ''

  return (
    <div>
      {selected ? (
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-900">Pargo pickup point selected</p>
          <p className="text-sm text-gray-800 mt-1">{selected.name || selected.code}</p>
          {selected.address && <p className="text-xs text-gray-600">{[selected.address, selected.city, selected.postalCode].filter(Boolean).join(', ')}</p>}
          <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm text-primary-600 hover:underline">
            Change pickup point
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-gray-700 hover:border-primary-400 hover:text-primary-600"
        >
          Choose a Pargo pickup point
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-900">Select a Pargo pickup point</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="flex-1">
              {token === '' ? (
                <div className="h-full flex items-center justify-center text-center text-sm text-gray-500 px-6">
                  The Pargo map is not configured yet. Please contact support to complete your order.
                </div>
              ) : mapUrl ? (
                <iframe title="Pargo pickup points" src={mapUrl} className="w-full h-full border-0" />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading map…</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
