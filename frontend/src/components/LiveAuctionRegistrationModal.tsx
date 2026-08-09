import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, TicketIcon, WalletIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { formatPrice } from '../utils/formatters';
import { useAuthStore } from '../store/authStore';
import auctionRegistrationService from '../services/auctionRegistrationService';
import toast from 'react-hot-toast';

interface LiveAuctionRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product: any;
  userBalance: number;
}

export default function LiveAuctionRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  product,
  userBalance
}: LiveAuctionRegistrationModalProps) {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const [isRegistering, setIsRegistering] = useState(false);

  const registrationFee = product?.registrationFee || 5;
  const hasEnoughBalance = userBalance >= registrationFee;

  const handleRegister = async () => {
    if (!hasEnoughBalance) {
      toast.error('Insufficient balance. Please add funds to your wallet.');
      return;
    }

    setIsRegistering(true);
    try {
      const result = await auctionRegistrationService.register(product.id);
      if (result.success) {
        // Update user balance in auth store
        if (user && result.newBalance !== undefined) {
          updateUser({ ...user, balance: result.newBalance });
        }
        toast.success('Successfully registered for this live auction!');
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to register. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleAddFunds = () => {
    onClose();
    navigate('/wallet');
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-start">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Live Auction Registration
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex justify-center mb-4">
                    <div className="bg-orange-100 rounded-full p-3">
                      <TicketIcon className="h-12 w-12 text-orange-600" />
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 text-center mb-4">
                    This is a <span className="font-semibold text-orange-600">Live Auction</span>.
                    You need to pay a registration fee to participate.
                  </p>

                  {/* Product Info */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="font-medium text-gray-900 truncate">{product?.title}</p>
                    <p className="text-sm text-gray-500">Current Price: {formatPrice(product?.currentPrice || 0)}</p>
                  </div>

                  {/* Fee & Balance Info */}
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="text-gray-700">Registration Fee</span>
                      <span className="font-bold text-orange-600">{formatPrice(registrationFee)}</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <WalletIcon className="h-5 w-5 text-gray-500" />
                        <span className="text-gray-700">Your Balance</span>
                      </div>
                      <span className={`font-bold ${hasEnoughBalance ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPrice(userBalance)}
                      </span>
                    </div>
                  </div>

                  {/* Insufficient Balance Warning */}
                  {!hasEnoughBalance && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-red-800 font-medium">Insufficient Balance</p>
                          <p className="text-xs text-red-600">
                            You need {formatPrice(Number(registrationFee) - Number(userBalance))} more to register.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {hasEnoughBalance ? (
                      <button
                        type="button"
                        disabled={isRegistering}
                        onClick={handleRegister}
                        className="w-full inline-flex justify-center items-center rounded-md border border-transparent bg-orange-600 px-4 py-3 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRegistering ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Registering...
                          </>
                        ) : (
                          <>
                            <TicketIcon className="h-5 w-5 mr-2" />
                            Pay {formatPrice(registrationFee)} & Register
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAddFunds}
                        className="w-full inline-flex justify-center items-center rounded-md border border-transparent bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      >
                        <WalletIcon className="h-5 w-5 mr-2" />
                        Add Funds to Wallet
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full inline-flex justify-center items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                    >
                      Cancel
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 text-center mt-4">
                    The registration fee is non-refundable unless the auction is cancelled.
                  </p>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
