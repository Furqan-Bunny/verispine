import { Link } from 'react-router-dom'

// Privacy Policy — POPIA-aligned. Plain-language summary of how Quicksell handles personal
// information. This should be reviewed by the business/legal before launch.
const Privacy = () => {
  const lastUpdated = '22 June 2026'

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: {lastUpdated}</p>

      <div className="space-y-6 text-gray-700 leading-relaxed">
        <p>
          Quicksell ("we", "us") respects your privacy and is committed to protecting your personal
          information in line with the Protection of Personal Information Act, 2013 (POPIA). This policy
          explains what we collect, why, and your rights.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Information we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Account details: name, email address, phone number and password.</li>
            <li>Verification (KYC) data where you apply to sell: identity documents and a selfie.</li>
            <li>Transaction data: orders, bids, payments, payouts and delivery addresses.</li>
            <li>Technical data: device, browser and usage information needed to run and secure the service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">2. How we use your information</h2>
          <p>
            We use your information to create and secure your account, process orders and payments,
            arrange delivery, verify sellers, prevent fraud, provide support, and meet legal obligations.
            We do not sell your personal information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Sharing</h2>
          <p>
            We share information only with the service providers needed to run Quicksell — payment
            gateways, courier/shipping partners, and our hosting and email providers — and where required
            by law. These parties may only use it to provide their service to us.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Payment & card data</h2>
          <p>
            Card details are entered on our payment provider's secure, 3-D Secure hosted page. Quicksell
            does not store your full card number.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Retention & security</h2>
          <p>
            We keep personal information only as long as needed for the purposes above or as the law
            requires, and we apply reasonable technical and organisational measures to protect it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">6. Your rights</h2>
          <p>
            Under POPIA you may request access to, correction of, or deletion of your personal
            information, and you may object to certain processing. To exercise these rights, contact us at{' '}
            <a href="mailto:info@quicksellsa.co.za" className="text-primary-600 hover:underline">info@quicksellsa.co.za</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">7. Changes</h2>
          <p>
            We may update this policy from time to time. The "last updated" date above reflects the most
            recent version.
          </p>
        </section>

        <p className="text-sm text-gray-500 pt-4 border-t">
          See also our <Link to="/terms" className="text-primary-600 hover:underline">Terms &amp; Conditions</Link> and{' '}
          <Link to="/help" className="text-primary-600 hover:underline">Help Centre</Link>.
        </p>
      </div>
    </div>
  )
}

export default Privacy
