import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, UserPlusIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

interface RegistrationPromptProps {
  isOpen: boolean;
  onClose: () => void;
  action?: string;
}

export default function RegistrationPrompt({ isOpen, onClose, action = 'place a bid' }: RegistrationPromptProps) {
  const navigate = useNavigate();

  const handleRegister = () => {
    onClose();
    navigate('/register');
  };

  const handleLogin = () => {
    onClose();
    navigate('/login');
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
                    Registration Required
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
                    <div className="bg-primary-100 rounded-full p-3">
                      <UserPlusIcon className="h-12 w-12 text-primary-600" />
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 text-center mb-6">
                    You need to be registered and logged in to {action} on Quicksell.
                  </p>

                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Why Register?</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-start">
                        <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span>Secure bidding with buyer protection</span>
                      </li>
                      <li className="flex items-start">
                        <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span>Track your bids and watch items</span>
                      </li>
                      <li className="flex items-start">
                        <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span>Get notifications on auction updates</span>
                      </li>
                      <li className="flex items-start">
                        <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        <span>Access to exclusive deals and features</span>
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      className="w-full inline-flex justify-center items-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={handleRegister}
                    >
                      <UserPlusIcon className="h-5 w-5 mr-2" />
                      Register Now - It's Free!
                    </button>

                    <button
                      type="button"
                      className="w-full inline-flex justify-center items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={handleLogin}
                    >
                      Already have an account? Sign In
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 text-center mt-4">
                    By registering, you agree to our Terms of Service and Privacy Policy
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