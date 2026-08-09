import { Link } from 'react-router-dom'
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'
import { FaFacebook, FaTwitter, FaInstagram, FaLinkedin } from 'react-icons/fa'

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <img src="/logo-light.svg" alt="" className="h-9 w-9" />
              <span className="text-2xl font-bold font-display">VeriSpine</span>
            </div>
            <p className="text-gray-400 mb-4">
              Medical equipment and machinery marketplace. Buy, sell and bid on
              imaging, surgical, rehab and diagnostic equipment from verified sellers.
            </p>
            <div className="flex space-x-4">
              <a href="https://www.facebook.com/people/Minz/100091212656085/" target="_blank" rel="noopener noreferrer" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <FaFacebook size={20} />
              </a>
              <a href="#" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <FaTwitter size={20} />
              </a>
              <a href="https://www.instagram.com/minzolor/" target="_blank" rel="noopener noreferrer" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <FaInstagram size={20} />
              </a>
              <a href="#" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                <FaLinkedin size={20} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/products" className="text-gray-400 hover:text-white transition-colors">
                  Browse Auctions
                </Link>
              </li>
              <li>
                <Link to="/create-auction" className="text-gray-400 hover:text-white transition-colors">
                  Sell Your Items
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors">
                  My Account
                </Link>
              </li>
              <li>
                <Link to="/orders" className="text-gray-400 hover:text-white transition-colors">
                  Track Orders
                </Link>
              </li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Popular Categories</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/products?category=imaging-equipment" className="text-gray-400 hover:text-white transition-colors">
                  Imaging Equipment
                </Link>
              </li>
              <li>
                <Link to="/products?category=surgical-instruments" className="text-gray-400 hover:text-white transition-colors">
                  Surgical Instruments
                </Link>
              </li>
              <li>
                <Link to="/products?category=patient-monitoring" className="text-gray-400 hover:text-white transition-colors">
                  Patient Monitoring
                </Link>
              </li>
              <li>
                <Link to="/products?category=rehab-physical-therapy" className="text-gray-400 hover:text-white transition-colors">
                  Rehab &amp; Physical Therapy
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Contact Us</h3>
            <ul className="space-y-3">
              <li className="flex items-center space-x-2">
                <MapPinIcon className="h-5 w-5 text-gray-400" />
                <span className="text-gray-400">Decatur, Georgia, USA</span>
              </li>
              <li className="flex items-center space-x-2">
                <PhoneIcon className="h-5 w-5 text-gray-400" />
                <a href="tel:+14045001675" className="text-gray-400 hover:text-white transition-colors">(404) 500-1675</a>
              </li>
              <li className="flex items-center space-x-2">
                <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                <a href="mailto:info@verispinejointcenters.com" className="text-gray-400 hover:text-white transition-colors">info@verispinejointcenters.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} VeriSpine Joint Centers. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-4 mt-4 md:mt-0">
            <Link to="/terms" className="text-gray-400 hover:text-white text-sm transition-colors">
              Terms of Service
            </Link>
            <Link to="/privacy" className="text-gray-400 hover:text-white text-sm transition-colors">
              Privacy Policy
            </Link>
            <Link to="/faq" className="text-gray-400 hover:text-white text-sm transition-colors">
              FAQ
            </Link>
            <Link to="/help" className="text-gray-400 hover:text-white text-sm transition-colors">
              Help Center
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer