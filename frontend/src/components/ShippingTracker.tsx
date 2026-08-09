import React, { useState, useEffect } from 'react';
import {
  TruckIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  MapPinIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import axios from '../config/axios';
import toast from 'react-hot-toast';

interface TrackingEvent {
  code: string;
  description: string;
  office: string;
  officeCode: string;
  timestamp: string;
  status: string;
}

interface TrackingInfo {
  trackingNumber: string;
  carrier?: string;
  weight: number;
  origin: {
    country: string;
    code: string;
  };
  destination: {
    country: string;
    code: string;
  };
  characteristics: {
    express: boolean;
    insured: {
      amount: number;
      currency: string;
    };
  };
  events: TrackingEvent[];
  currentStatus: string;
  lastUpdate: string | null;
}

interface ShippingTrackerProps {
  trackingNumber: string;
  onClose?: () => void;
  showDetails?: boolean;
}

const ShippingTracker: React.FC<ShippingTrackerProps> = ({
  trackingNumber,
  onClose,
  showDetails = true
}) => {
  const [loading, setLoading] = useState(false);
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (trackingNumber) {
      fetchTrackingInfo();
    }
  }, [trackingNumber]);

  const fetchTrackingInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/shipping/track/${trackingNumber}`);
      if (response.data.success && response.data.data.items.length > 0) {
        setTrackingInfo(response.data.data.items[0]);
      } else {
        setError('No tracking information found for this number');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch tracking information');
      toast.error('Unable to track shipment');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Order Shipped':
      case 'In Transit':
        return <TruckIcon className="h-6 w-6 text-blue-500" />;
      case 'Delivered':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'Order Cancelled':
        return <XCircleIcon className="h-6 w-6 text-red-500" />;
      case 'At Delivery Hub':
      case 'Out for Delivery':
        return <MapPinIcon className="h-6 w-6 text-indigo-500" />;
      case 'On Hold':
      case 'Delivery Attempted':
        return <ExclamationCircleIcon className="h-6 w-6 text-yellow-500" />;
      default:
        return <ClockIcon className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Order Shipped':
      case 'In Transit':
        return 'bg-blue-100 text-blue-800';
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      case 'Order Cancelled':
        return 'bg-red-100 text-red-800';
      case 'At Delivery Hub':
      case 'Out for Delivery':
        return 'bg-indigo-100 text-indigo-800';
      case 'On Hold':
      case 'Delivery Attempted':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-20 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tracking Error</h3>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={fetchTrackingInfo}
            className="mt-4 btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!trackingInfo) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <TruckIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tracking Info</h3>
          <p className="text-gray-600">Enter a tracking number to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Tracking: {trackingInfo.trackingNumber}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {(trackingInfo.carrier || 'SAPO') === 'ShipLogic' ? 'ShipLogic Courier' : 'SAPO Shipping Service'}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>

      {/* Current Status */}
      <div className="px-6 py-4 bg-gray-50">
        <div className="flex items-center space-x-4">
          {getStatusIcon(trackingInfo.currentStatus)}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Current Status
            </h3>
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(trackingInfo.currentStatus)}`}>
              {trackingInfo.currentStatus}
            </span>
            {trackingInfo.lastUpdate && (
              <p className="text-sm text-gray-600 mt-1">
                Last updated: {formatDate(trackingInfo.lastUpdate)}
              </p>
            )}
          </div>
        </div>
      </div>

      {showDetails && (
        <>
          {/* Shipment Details */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Shipment Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Origin</p>
                <p className="font-medium">{trackingInfo.origin.country}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Destination</p>
                <p className="font-medium">{trackingInfo.destination.country}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Weight</p>
                <p className="font-medium">{trackingInfo.weight} kg</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Service Type</p>
                <p className="font-medium">
                  {trackingInfo.characteristics.express ? 'Express' : 'Standard'}
                </p>
              </div>
              {trackingInfo.characteristics.insured.amount > 0 && (
                <div>
                  <p className="text-sm text-gray-600">Insured Value</p>
                  <p className="font-medium">
                    {trackingInfo.characteristics.insured.currency} {trackingInfo.characteristics.insured.amount}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Tracking Timeline */}
          <div className="px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Tracking History
            </h3>
            <div className="space-y-4">
              {trackingInfo.events.map((event, index) => (
                <div key={index} className="flex space-x-4">
                  <div className="flex-shrink-0">
                    <div className="relative">
                      {getStatusIcon(event.status)}
                      {index < trackingInfo.events.length - 1 && (
                        <div className="absolute top-6 left-3 w-0.5 h-16 bg-gray-300"></div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {event.description}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {event.office} • {event.officeCode}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">
                        {formatDate(event.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Footer Actions */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <button
            onClick={fetchTrackingInfo}
            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            Refresh Tracking
          </button>
          {(trackingInfo.carrier || 'SAPO') !== 'ShipLogic' && (
            <a
              href={`https://tracking.postoffice.co.za/tracking/${trackingInfo.trackingNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              View on SAPO Website →
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShippingTracker;