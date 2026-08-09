import axios from '../config/axios'

export interface BulkDeleteResult {
  success: boolean
  entity: string
  deleted: number
  failed: { id: string; reason: string }[]
}

// Permanently delete records (single = one id) via the admin hard-delete endpoint.
// See backend/utils/adminDelete.js for the per-entity cascade behaviour.
export async function adminBulkDelete(entity: string, ids: string[]): Promise<BulkDeleteResult> {
  const res = await axios.post('/api/admin-ext/bulk-delete', { entity, ids })
  return res.data
}
