import React, { useState, useEffect } from 'react';
import {
  Package,
  Truck,
  Settings,
  Search,
  RefreshCw,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit2,
  Eye,
  Send
} from 'lucide-react';
import { TrashIcon } from '@heroicons/react/24/outline';
import axios from '../../config/axios';
import toast from 'react-hot-toast';
import { useAdminSelection } from '../../hooks/useAdminSelection';
import { usePagination } from '../../hooks/usePagination';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import BulkDeleteBar from '../../components/admin/BulkDeleteBar';
import PaginationBar from '../../components/admin/PaginationBar';
import { adminBulkDelete } from '../../services/adminDelete';
import { FREIGHT_THRESHOLD_LBS } from '../../config/locale';

/**
 * The provider list must stay in step with backend/utils/shippingSettings.js —
 * saving a name the backend doesn't recognise silently falls back to the default.
 */
const SHIPPING_PROVIDERS = ['usps', 'ups', 'freight'] as const;
type ShippingProvider = typeof SHIPPING_PROVIDERS[number];
const DEFAULT_PROVIDER: ShippingProvider = 'usps';

const PROVIDER_LABEL: Record<ShippingProvider, string> = {
  usps: 'USPS',
  ups: 'UPS',
  freight: 'Freight (LTL)',
};

const isProvider = (v: any): v is ShippingProvider => SHIPPING_PROVIDERS.includes(v);

interface ShipmentData {
  id: string;
  orderId: string;
  trackingNumber: string;
  status: string;
  buyerName: string;
  sellerName: string;
  productTitle: string;
  createdAt: any;
  updatedAt: any;
  currentStatus?: string;
  events?: any[];
}

// Shipment/event timestamps come back as Firestore {_seconds} objects — handle those
// (and strings/Dates) so they don't render as "Invalid Date".
const toDate = (ts: any): Date | null => {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'object' && (ts._seconds != null || ts.seconds != null)) {
    return new Date((ts._seconds ?? ts.seconds) * 1000);
  }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (ts: any) => { const d = toDate(ts); return d ? d.toLocaleDateString() : 'N/A'; };
const fmtDateTime = (ts: any) => { const d = toDate(ts); return d ? d.toLocaleString() : 'N/A'; };

const AdminShipping: React.FC = () => {
  const [shipments, setShipments] = useState<ShipmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentData | null>(null);
  const [trackingModal, setTrackingModal] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [shippingSettings, setShippingSettings] = useState({
    activeProvider: DEFAULT_PROVIDER as ShippingProvider,
    enableAutoTracking: true,
    autoGenerateTracking: true,
    notifyOnStatusChange: true
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const sel = useAdminSelection();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Shipping statistics
  const [stats, setStats] = useState({
    totalShipments: 0,
    pendingShipments: 0,
    inTransit: 0,
    delivered: 0,
    cancelled: 0
  });

  useEffect(() => {
    fetchShipments();
    fetchShippingStats();
    fetchShippingSettings();
  }, []);

  const fetchShippingSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/admin/shipping/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data?.data || {};
      setShippingSettings((prev) => ({
        ...prev,
        ...data,
        activeProvider: isProvider(data.activeProvider) ? data.activeProvider : DEFAULT_PROVIDER
      }));
    } catch (error) {
      console.error('Error fetching shipping settings:', error);
    }
  };

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/admin/shipments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShipments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching shipments:', error);
      toast.error('Failed to load shipments');
    } finally {
      setLoading(false);
    }
  };

  const fetchShippingStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/admin/shipments/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data.data || stats);
    } catch (error) {
      console.error('Error fetching shipping stats:', error);
    }
  };

  const trackShipment = async (trackingNumber: string) => {
    try {
      const response = await axios.get(`/api/shipping/track/${trackingNumber}`);
      if (response.data.success && response.data.data.items.length > 0) {
        setTrackingInfo(response.data.data.items[0]);
        setTrackingModal(true);
      } else {
        toast.error('No tracking information found');
      }
    } catch (error) {
      console.error('Error tracking shipment:', error);
      toast.error('Failed to track shipment');
    }
  };

  const generateTrackingNumber = async (orderId: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/shipping/generate-tracking',
        { orderId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        toast.success('Tracking number generated successfully');
        fetchShipments();
      }
    } catch (error) {
      console.error('Error generating tracking number:', error);
      toast.error('Failed to generate tracking number');
    }
  };

  const updateShipmentStatus = async (trackingNumber: string, eventCode: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/shipping/update-event',
        { trackingNumber, eventCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        toast.success('Shipment status updated');
        fetchShipments();
      }
    } catch (error) {
      console.error('Error updating shipment:', error);
      toast.error('Failed to update shipment status');
    }
  };

  const markAsDelivered = async (trackingNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/shipping/mark-delivered',
        { trackingNumber, signature: 'Admin Confirmed' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        toast.success('Shipment marked as delivered');
        fetchShipments();
      }
    } catch (error) {
      console.error('Error marking as delivered:', error);
      toast.error('Failed to mark as delivered');
    }
  };

  // Hard-delete one or many shipment records via the admin bulk-delete endpoint.
  const doDelete = async (ids: string[]) => {
    if (!ids.length) return;
    setDeleting(true);
    try {
      const res = await adminBulkDelete('shipments', ids);
      setShipments(prev => prev.filter((r: any) => !ids.includes(r.id)));
      res.failed?.length
        ? toast.error(`${res.failed.length} failed: ${res.failed[0].reason}`)
        : toast.success(`Deleted ${res.deleted}`);
      sel.clear();
      setRowToDelete(null);
      setBulkOpen(false);
      fetchShippingStats();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/admin/shipping/settings',
        shippingSettings,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Shipping settings saved — active carrier: ${PROVIDER_LABEL[shippingSettings.activeProvider]}`);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'shipped':
      case 'In Transit':
        return <Truck className="h-5 w-5 text-blue-500" />;
      case 'delivered':
      case 'Delivered':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'cancelled':
      case 'Order Cancelled':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'At Delivery Hub':
      case 'Out for Delivery':
        return <MapPin className="h-5 w-5 text-indigo-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'shipped':
      case 'In Transit':
        return 'bg-blue-100 text-blue-800';
      case 'delivered':
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
      case 'Order Cancelled':
        return 'bg-red-100 text-red-800';
      case 'At Delivery Hub':
      case 'Out for Delivery':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredShipments = shipments.filter(shipment => {
    const matchesSearch = 
      shipment.trackingNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shipment.buyerName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || shipment.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: filteredShipments,
    itemsPerPage: 20,
    resetPageOn: [searchTerm, statusFilter]
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Shipping Management</h1>
        <p className="text-gray-600">Manage shipments and tracking for all orders</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Shipments</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalShipments}</p>
            </div>
            <Package className="h-8 w-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pendingShipments}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">In Transit</p>
              <p className="text-2xl font-bold text-blue-600">{stats.inTransit}</p>
            </div>
            <Truck className="h-8 w-8 text-blue-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Delivered</p>
              <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Cancelled</p>
              <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-white rounded-lg shadow mb-6 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Settings className="h-5 w-5 mr-2" />
          Shipping Settings
        </h2>
        {/* Active courier provider — platform-wide delivery system toggle */}
        <div className="mb-6 p-4 border border-primary-200 bg-primary-50 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900 flex items-center">
                <Truck className="h-5 w-5 mr-2 text-primary-600" />
                Active Carrier
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Which carrier ships all new parcel orders. Items over {FREIGHT_THRESHOLD_LBS} lbs or larger
                than 108" in any dimension are routed to freight automatically, whatever is selected here.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white">
              {SHIPPING_PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setShippingSettings({ ...shippingSettings, activeProvider: p })}
                  className={`px-5 py-2 text-sm font-semibold transition ${
                    shippingSettings.activeProvider === p
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={shippingSettings.enableAutoTracking}
                onChange={(e) => setShippingSettings({
                  ...shippingSettings,
                  enableAutoTracking: e.target.checked
                })}
                className="form-checkbox h-5 w-5 text-primary-600"
              />
              <span className="text-gray-700">Enable Auto Tracking Updates</span>
            </label>
          </div>
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={shippingSettings.autoGenerateTracking}
                onChange={(e) => setShippingSettings({
                  ...shippingSettings,
                  autoGenerateTracking: e.target.checked
                })}
                className="form-checkbox h-5 w-5 text-primary-600"
              />
              <span className="text-gray-700">Auto Generate Tracking Numbers</span>
            </label>
          </div>
          <div>
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={shippingSettings.notifyOnStatusChange}
                onChange={(e) => setShippingSettings({
                  ...shippingSettings,
                  notifyOnStatusChange: e.target.checked
                })}
                className="form-checkbox h-5 w-5 text-primary-600"
              />
              <span className="text-gray-700">Notify on Status Changes</span>
            </label>
          </div>
        </div>
        <button
          onClick={saveSettings}
          disabled={savingSettings}
          className="mt-4 btn-primary disabled:opacity-50"
        >
          {savingSettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search by tracking number, order ID, or buyer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              onClick={fetchShipments}
              className="btn-secondary flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Shipments Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        onDelete={() => setBulkOpen(true)}
        onClear={sel.clear}
        label="shipment"
      />
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  checked={sel.allSelected(paginatedItems.map(s => s.id))}
                  onChange={() => sel.toggleAll(paginatedItems.map(s => s.id))}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order / Tracking
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Buyer / Seller
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                </td>
              </tr>
            ) : filteredShipments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No shipments found
                </td>
              </tr>
            ) : (
              paginatedItems.map((shipment) => (
                <tr key={shipment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={sel.isSelected(shipment.id)}
                      onChange={() => sel.toggle(shipment.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        #{shipment.orderId?.slice(-8).toUpperCase()}
                      </p>
                      {shipment.trackingNumber && (
                        <p className="text-xs text-gray-500">
                          {shipment.trackingNumber}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 line-clamp-1">
                      {shipment.productTitle}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm text-gray-900">{shipment.buyerName}</p>
                      <p className="text-xs text-gray-500">{shipment.sellerName}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(shipment.currentStatus || shipment.status)}
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(shipment.currentStatus || shipment.status)}`}>
                        {shipment.currentStatus || shipment.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {fmtDate(shipment.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex space-x-2">
                      {shipment.trackingNumber ? (
                        <>
                          <button
                            onClick={() => trackShipment(shipment.trackingNumber)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Track Shipment"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {shipment.status !== 'delivered' && (
                            <button
                              onClick={() => markAsDelivered(shipment.trackingNumber)}
                              className="text-green-600 hover:text-green-900"
                              title="Mark as Delivered"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => generateTrackingNumber(shipment.orderId)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Generate Tracking"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setRowToDelete(shipment.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Shipment"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-6 pb-4">
          <PaginationBar
            total={totalItems}
            start={startIndex}
            end={endIndex}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            label="shipment"
          />
        </div>
      </div>

      {/* Tracking Modal */}
      {trackingModal && trackingInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Tracking Information</h2>
              <button
                onClick={() => setTrackingModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-semibold">Tracking Number: {trackingInfo.trackingNumber}</p>
                <p className="text-sm text-gray-600">Weight: {trackingInfo.weight} kg</p>
                <p className="text-sm text-gray-600">
                  Route: {trackingInfo.origin?.country} → {trackingInfo.destination?.country}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Tracking Events</h3>
                <div className="space-y-2">
                  {trackingInfo.events?.map((event: any, index: number) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded">
                      {getStatusIcon(event.status)}
                      <div className="flex-1">
                        <p className="font-medium">{event.description}</p>
                        <p className="text-sm text-gray-600">
                          {event.office} • {fmtDateTime(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single delete confirmation */}
      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete shipment?"
        message="This permanently deletes the shipment record. This action cannot be undone."
        loading={deleting}
        onConfirm={() => rowToDelete && doDelete([rowToDelete])}
        onCancel={() => setRowToDelete(null)}
      />

      {/* Bulk delete confirmation */}
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} shipment(s)?`}
        message="This permanently deletes the selected shipment records. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </div>
  );
};

export default AdminShipping;