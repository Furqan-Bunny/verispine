import { Link } from 'react-router-dom'

// Help Centre — entry point for support. Points users at the FAQ, key flows, and contact.
const Help = () => {
  const topics = [
    { title: 'Buying & bidding', body: 'Browse listings, place a bid or buy now, then pay securely at checkout.', to: '/products', cta: 'Browse products' },
    { title: 'Payments', body: 'Pay by Wallet, AddPay, or card (3-D Secure). Card details are entered on the provider’s secure page.', to: '/wallet', cta: 'Go to Wallet' },
    { title: 'Orders & delivery', body: 'Track your orders and delivery status from your Orders page.', to: '/orders', cta: 'My orders' },
    { title: 'Selling', body: 'Apply to become a seller (KYC required), then list and manage your products.', to: '/become-seller', cta: 'Become a seller' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Help Centre</h1>
      <p className="text-gray-600 mb-8">
        Find answers and learn how Quicksell works. Most questions are covered in our{' '}
        <Link to="/faq" className="text-primary-600 hover:underline">FAQ</Link>.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {topics.map((t) => (
          <div key={t.title} className="border border-gray-200 rounded-lg p-4">
            <h2 className="font-semibold text-gray-900 mb-1">{t.title}</h2>
            <p className="text-sm text-gray-600 mb-3">{t.body}</p>
            <Link to={t.to} className="text-sm text-primary-600 hover:underline font-medium">{t.cta} →</Link>
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold text-gray-900 mb-1">Still need help?</h2>
        <p className="text-sm text-gray-600">
          Email our support team at{' '}
          <a href="mailto:info@quicksellsa.co.za" className="text-primary-600 hover:underline">info@quicksellsa.co.za</a>{' '}
          and we'll get back to you. See also our{' '}
          <Link to="/terms" className="text-primary-600 hover:underline">Terms</Link> and{' '}
          <Link to="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}

export default Help
