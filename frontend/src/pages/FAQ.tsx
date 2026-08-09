import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

interface FAQItem {
  question: string
  answer: string
}

interface FAQSection {
  title: string
  items: FAQItem[]
}

const faqData: FAQSection[] = [
  {
    title: 'General',
    items: [
      {
        question: 'What is VeriSpine?',
        answer: 'VeriSpine is a US medical equipment marketplace where you can buy and sell imaging systems, surgical instruments, rehab equipment and machinery through live bidding, Buy Now purchases, and scheduled auctions. We provide a secure marketplace with integrated payments and nationwide shipping via trusted courier partners.'
      },
      {
        question: 'Is VeriSpine free to use?',
        answer: 'Creating an account and browsing auctions is completely free. Sellers may be charged listing fees and a commission on completed sales. Buyers pay the item price plus any applicable shipping costs. All fees are clearly displayed before you confirm any transaction.'
      },
      {
        question: 'Do I need an account to browse auctions?',
        answer: 'No, you can browse all active auctions and view product details without an account. However, you need to create a free account to place bids, make purchases, sell items, or use the VeriSpine Wallet.'
      }
    ]
  },
  {
    title: 'Account & Registration',
    items: [
      {
        question: 'How do I create an account?',
        answer: 'Click "Register" on the top right of the page. You\'ll need to provide your first and last name, a username, a valid email address, and a password (minimum 6 characters with at least one uppercase letter, one lowercase letter, and one number). After submitting, you\'ll receive a verification code via email to activate your account.'
      },
      {
        question: 'What is email verification?',
        answer: 'After registering, we send a 6-digit One-Time Password (OTP) to your email address. You must enter this code to verify your email and activate your account. The OTP is valid for 10 minutes, and you can request a new one after 60 seconds.'
      },
      {
        question: 'How do I reset my password?',
        answer: 'Click "Forgot Password" on the login page and enter your registered email address. You\'ll receive a password reset link via email. Follow the link to set a new password. For security reasons, the reset link expires after a limited time.'
      },
      {
        question: 'What is KYC verification and do I need it?',
        answer: 'KYC (Know Your Customer) is an optional identity verification process that enhances trust on your account. It requires a valid government-issued ID, passport, or driver\'s licence and a clear selfie. KYC submissions are reviewed within 1-2 business days. While optional, VeriSpine may require KYC verification for certain activities.'
      }
    ]
  },
  {
    title: 'Bidding & Auctions',
    items: [
      {
        question: 'How do I place a bid?',
        answer: 'Navigate to an active auction and enter your bid amount, which must be higher than the current highest bid. Click "Place Bid" to submit. All bids are final and legally binding — once placed, a bid cannot be retracted. You\'ll receive real-time notifications if you\'re outbid.'
      },
      {
        question: 'Can I cancel or retract a bid?',
        answer: 'No. All bids on VeriSpine are final and legally binding. Once you place a bid, it cannot be cancelled or retracted. Please make sure you\'re comfortable with your bid amount before submitting.'
      },
      {
        question: 'What happens when I win an auction?',
        answer: 'When the auction timer expires and you have the highest bid, you win the auction. You\'ll receive an email and in-app notification confirming your win and the final price. An order is automatically created with a "Pending Payment" status, and you\'ll need to complete payment to finalise the purchase.'
      },
      {
        question: 'What is a Buy Now option?',
        answer: 'Some items are listed with a fixed Buy Now price, allowing you to purchase them immediately without waiting for an auction to end. Simply click "Buy Now" on the product page and proceed to checkout.'
      },
      {
        question: 'What are Scheduled/Upcoming auctions?',
        answer: 'Scheduled auctions are listings that have been announced but haven\'t started yet. You can browse upcoming auctions to see what\'s coming soon and plan your bids. You\'ll receive a notification when a scheduled auction goes live so you don\'t miss out.'
      },
      {
        question: 'What happens if I\'m outbid?',
        answer: 'You\'ll receive an instant notification (via email and in-app) when someone places a higher bid on an auction you\'re participating in. You can then choose to place a new, higher bid or let the current bidder proceed.'
      }
    ]
  },
  {
    title: 'Buying & Payments',
    items: [
      {
        question: 'What payment methods are accepted?',
        answer: 'VeriSpine accepts two payment methods: (1) VeriSpine Wallet — pay instantly from your account balance; (2) Card payment via Stripe — credit and debit cards (Visa, Mastercard, Amex, Discover), secured by 3-D Secure. All payments are processed in US Dollars (USD).'
      },
      {
        question: 'How does the VeriSpine Wallet work?',
        answer: 'The VeriSpine Wallet is a digital balance stored in your account. You can add funds by card and use your wallet balance to pay for purchases instantly. Sellers also receive their sale proceeds into their wallet after platform fees are deducted. Your wallet balance is displayed on your dashboard and in the navigation bar.'
      },
      {
        question: 'How do I top up my wallet?',
        answer: 'Go to your Wallet page from the navigation menu, enter the amount you\'d like to add (minimum $10.00), choose your card, and complete the card payment. Funds are added to your wallet balance once the payment is confirmed.'
      },
      {
        question: 'Is my payment secure?',
        answer: 'Yes. All payments are processed through trusted, PCI-compliant provider (Stripe). VeriSpine never sees or stores your card details. Card payments are protected with 3-D Secure verification for added security.'
      }
    ]
  },
  {
    title: 'Selling',
    items: [
      {
        question: 'How do I sell an item on VeriSpine?',
        answer: 'Log in to your account and click "Sell" or "Create Auction". Fill in the item details including title, description, images, category, starting price, and auction duration. You can also set a Buy Now price or a reserve price. Once submitted, your listing will go live and buyers can start bidding.'
      },
      {
        question: 'How do I receive my payment after a sale?',
        answer: 'After a sale is completed, your proceeds (minus platform commission) are added to your VeriSpine Wallet as a pending balance. Once the order is marked as "Delivered", the funds become available in your wallet. You can then request a withdrawal to your bank account.'
      },
      {
        question: 'What fees does VeriSpine charge?',
        answer: 'VeriSpine may charge listing fees and a commission on completed sales, which is deducted from the seller\'s proceeds. All applicable fees are clearly displayed before you confirm a listing. The exact fee structure is shown during the listing creation process.'
      }
    ]
  },
  {
    title: 'Shipping & Delivery',
    items: [
      {
        question: 'How does shipping work?',
        answer: 'VeriSpine ships through trusted US carriers. Larger machinery ships as freight with a custom quote. Once your payment is confirmed, a shipment is automatically created and a unique tracking number is generated. The tracking number appears in your order details and is also sent to you via email.'
      },
      {
        question: 'How long does delivery take?',
        answer: 'Estimated delivery times depend on the route: Same Province — 2 to 3 business days (standard) or 1 to 2 days (express); Adjacent Province — 3 to 5 business days (standard) or 2 to 3 days (express); Distant Province — 5 to 7 business days (standard) or 3 to 4 days (express). These are estimates and actual times may vary.'
      },
      {
        question: 'How do I track my order?',
        answer: 'Once your order is shipped, a tracking number is assigned. You can view tracking updates in your order details on VeriSpine, or on the courier\'s tracking page. Your order progresses through stages: Pending Payment, Processing, Shipped, In Transit, Out for Delivery, and Delivered.'
      },
      {
        question: 'What areas do you deliver to?',
        answer: 'VeriSpine currently delivers to addresses within the United States. Shipping costs are based on the item weight, size, and the distance between the seller\'s location and your delivery address.'
      }
    ]
  },
  {
    title: 'Security & Trust',
    items: [
      {
        question: 'How is my personal information protected?',
        answer: 'VeriSpine processes all personal data in accordance with the Protection of Personal Information Act (POPIA). We collect only the information necessary to operate the platform, and we never sell your personal data to third parties. Passwords are securely hashed and cannot be recovered by anyone, including VeriSpine staff.'
      },
      {
        question: 'How do I report a problem?',
        answer: 'If you experience any issues with an order, a listing, or another user, you can contact our support team directly. We take all reports seriously and will investigate any concerns related to fraud, misrepresentation, or policy violations.'
      },
      {
        question: 'How do I contact support?',
        answer: 'You can reach the VeriSpine support team by emailing info@verispinejointcenters.com. We aim to respond to all enquiries as quickly as possible. For urgent matters, please include your order number or account details in your email for faster assistance.'
      }
    ]
  }
]

const FAQItemComponent = ({ item }: { item: FAQItem }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900 pr-4">{item.question}</span>
        <ChevronDownIcon
          className={`h-5 w-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-4 text-gray-600 leading-relaxed">
          {item.answer}
        </div>
      )}
    </div>
  )
}

const FAQ = () => {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
          Frequently Asked Questions
        </h1>
        <p className="text-gray-500 mb-8">
          Find answers to common questions about using VeriSpine.
        </p>

        <div className="space-y-8">
          {faqData.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-gray-900 mb-4">{section.title}</h2>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <FAQItemComponent key={item.question} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-10 bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-700 font-medium mb-1">Still have questions?</p>
          <p className="text-gray-500 text-sm">
            Contact us at{' '}
            <a
              href="mailto:info@verispinejointcenters.com"
              className="text-primary-600 hover:underline"
            >
              info@verispinejointcenters.com
            </a>
          </p>
        </div>

        {/* Back to top / navigation */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link to="/" className="text-primary-600 hover:text-primary-700 font-medium">
            &larr; Back to Home
          </Link>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Back to Top
          </button>
        </div>
      </div>
    </div>
  )
}

export default FAQ
