import { Link } from 'react-router-dom'
import { useEffect } from 'react'

const Terms = () => {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white rounded-xl shadow-lg p-6 sm:p-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
          Terms and Conditions
        </h1>
        <p className="text-sm text-gray-500 mb-8">Last Updated: 4 June 2026</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">
          <p>
            These Terms and Conditions ("Terms") govern the use of the VeriSpine online
            marketplace (auction and fixed-price), website, mobile application, and related
            services (collectively, the "Platform").
          </p>
          <p>
            By accessing, registering on, bidding on, selling through, or otherwise using VeriSpine,
            you agree to be legally bound by these Terms. If you do not agree, you must not use the
            Platform.
          </p>

          {/* 1. DEFINITIONS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Definitions</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>"VeriSpine"</strong> means VeriSpine Joint Centers or its nominated operating entity.</li>
              <li><strong>"User"</strong> means any person who accesses or uses the Platform, including Buyers and Sellers.</li>
              <li><strong>"Buyer"</strong> means a User who places a bid or purchases an item.</li>
              <li><strong>"Seller"</strong> means a User who lists an item for auction or sale.</li>
              <li><strong>"Auction"</strong> means the online bidding process conducted on the Platform.</li>
              <li><strong>"Item"</strong> means any goods or services listed on VeriSpine.</li>
              <li><strong>"Wallet"</strong> means the digital balance held in a User's VeriSpine account, denominated in South African Rand (ZAR).</li>
              <li><strong>"KYC"</strong> means Know Your Customer identity verification.</li>
              <li><strong>"CPA"</strong> means the Consumer Protection Act 68 of 2008.</li>
              <li><strong>"ECTA"</strong> means the Electronic Communications and Transactions Act 25 of 2002.</li>
              <li><strong>"POPIA"</strong> means the Protection of Personal Information Act 4 of 2013.</li>
            </ul>
          </section>

          {/* 2. LEGAL STATUS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Legal Status and Application</h2>
            <p>2.1 These Terms constitute a legally binding electronic agreement in terms of ECTA.</p>
            <p>2.2 These Terms apply to all Users, including private individuals and businesses.</p>
            <p>2.3 Nothing in these Terms limits any non-excludable consumer rights under the CPA.</p>
          </section>

          {/* 3. ELIGIBILITY AND REGISTRATION */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Eligibility and Registration</h2>
            <p className="font-semibold text-gray-800 mb-3">3.1 Eligibility</p>
            <p>Users must be at least 18 years old and legally competent to enter into binding agreements under South African law.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">3.2 Registration Process</p>
            <p>To use certain features of the Platform (including bidding, buying, selling, and accessing your Wallet), you must create an account. The registration process is as follows:</p>

            <div className="bg-gray-50 rounded-lg p-5 my-4">
              <p className="font-semibold text-gray-900 mb-3">Step 1: Create Your Account</p>
              <p className="mb-2">Provide the following required information:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>First Name and Last Name</li>
                <li>Username (minimum 3 characters; letters, numbers, and underscores only)</li>
                <li>Email Address (a valid, accessible email is required)</li>
                <li>Password (minimum 6 characters; must include at least one uppercase letter, one lowercase letter, and one number)</li>
                <li>Acceptance of these Terms and Conditions and the Privacy Policy</li>
              </ul>
              <p className="mt-2 text-sm text-gray-600">
                If you were invited via a referral link, your email may be pre-filled. A referral code is optional and does not change your own account features or pricing; however, the User who referred you may earn affiliate commission on your purchases (see Section 21 - Affiliate / Referral Program).
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-5 my-4">
              <p className="font-semibold text-gray-900 mb-3">Step 2: Verify Your Email</p>
              <p>After submitting registration, a 6-digit One-Time Password (OTP) will be sent to your email address. You must enter this code to verify your email. The OTP is valid for 10 minutes. You may request a new code after 60 seconds. A maximum of 5 incorrect attempts is permitted before a new code must be requested.</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-5 my-4">
              <p className="font-semibold text-gray-900 mb-3">Step 3: Account Activation</p>
              <p>Upon successful email verification, your account is activated immediately. You will receive a welcome email confirming your registration. All new accounts are registered with a "User" role (Buyer), with a starting Wallet balance of R0.00.</p>
            </div>

            <p className="font-semibold text-gray-800 mt-4 mb-3">3.3 KYC Verification (Optional)</p>
            <p>
              Users may optionally complete Know Your Customer (KYC) verification to enhance account trust and access certain features. KYC requires:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>A valid identity document (South African ID, Passport, or Driver's Licence)</li>
              <li>A clear selfie photograph</li>
              <li>Documents must be under 5MB in size (image or PDF format)</li>
            </ul>
            <p className="mt-2">KYC submissions are reviewed manually by VeriSpine administrators within 1-2 business days. VeriSpine reserves the right to require KYC verification at any time.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">3.4 Account Accuracy</p>
            <p>Users must provide accurate, current, and complete registration information. VeriSpine reserves the right to suspend or terminate accounts providing false or misleading information.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">3.5 Account Security</p>
            <p>Users are responsible for maintaining the confidentiality of their login credentials. Passwords are securely hashed and cannot be recovered by VeriSpine. If you suspect unauthorised access to your account, you must notify VeriSpine immediately and reset your password.</p>
          </section>

          {/* 4. PLATFORM ROLE */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Platform Role and Limitation</h2>
            <p>4.1 VeriSpine is an online marketplace and, in certain circumstances, may also act as a Seller or Buyer, unless explicitly stated otherwise.</p>
            <p>4.2 VeriSpine does not guarantee the quality, legality, safety, or accuracy of items listed by third-party Sellers.</p>
            <p>4.3 Contracts of sale are concluded directly between the Seller and Buyer.</p>
          </section>

          {/* 5. AUCTION PROCESS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Auction Process</h2>
            <p className="font-semibold text-gray-800 mb-3">5.1 Types of Listings</p>
            <p>Items may be listed as:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Timed Auctions</strong> - Bidding takes place over a set time period. The highest valid bid at the close of the auction wins.</li>
              <li><strong>Fixed-Price ("For Sale") Listings</strong> - Items listed at a fixed price that may be purchased immediately without bidding. A fixed-price listing may carry a set quantity (stock); each purchase reduces the available stock until the item is sold out.</li>
              <li><strong>Buy-Now on Auctions</strong> - Some auction listings additionally offer an optional fixed "Buy Now" price, allowing immediate purchase without waiting for the auction to end.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">5.2 How Bidding Works</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>All bids are <strong>final and legally binding</strong>. Once placed, a bid cannot be retracted.</li>
              <li>Each bid must be higher than the current highest bid.</li>
              <li>Bidding activity is updated in real time on the Platform.</li>
              <li>You will receive notifications when you are outbid or when an auction you are participating in is ending soon.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">5.3 Winning an Auction</p>
            <div className="bg-blue-50 rounded-lg p-5 my-4">
              <p className="font-semibold text-blue-900 mb-3">What happens when an auction ends:</p>
              <ol className="list-decimal pl-6 space-y-2">
                <li>When the auction timer expires, the system automatically determines the winner based on the <strong>highest valid bid</strong>.</li>
                <li>The winning Buyer receives an <strong>email notification</strong> and an <strong>in-app notification</strong> confirming the win and the final price.</li>
                <li>An <strong>Order is automatically created</strong> with a status of "Pending Payment".</li>
                <li>The winning Buyer must proceed to complete payment (see Section 6 below).</li>
                <li>All other bidders are notified that they were outbid.</li>
                <li>If an auction ends with <strong>no bids</strong>, no sale is concluded and the item is marked as ended.</li>
              </ol>
            </div>

            <p className="font-semibold text-gray-800 mt-4 mb-3">5.4 Buy-Now Purchases</p>
            <p>If an item has a Buy-Now price, you may purchase it immediately without waiting for the auction to end. Clicking "Buy Now" will take you directly to the checkout process (see Section 6).</p>

            <p>5.5 VeriSpine may withdraw or cancel items after bidding has commenced under exceptional circumstances, including but not limited to suspected fraud, prohibited items, or technical errors.</p>
          </section>

          {/* 6. PAYMENT */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Fees, Payment, and Wallet</h2>

            <p className="font-semibold text-gray-800 mb-3">6.1 Platform Fees</p>
            <p>VeriSpine may charge the following fees:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Listing fees (for Sellers)</li>
              <li>Commission fees on completed sales (deducted from the Seller's proceeds)</li>
              <li>Payment processing fees</li>
            </ul>
            <p className="mt-2">All applicable fees are displayed before you confirm a listing or purchase. Sellers receive their proceeds after deduction of the applicable platform commission.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">6.2 How Payment Works After Winning an Auction or Buying an Item</p>
            <div className="bg-green-50 rounded-lg p-5 my-4">
              <p className="font-semibold text-green-900 mb-3">Step-by-step payment process:</p>
              <ol className="list-decimal pl-6 space-y-3">
                <li>
                  <strong>Go to Your Order:</strong> After winning an auction or clicking "Buy Now", navigate to your order via the notification link or the "Orders" page in your account.
                </li>
                <li>
                  <strong>Enter Shipping Information:</strong> Provide your full delivery address including: full name, email, phone number, street address, city, province, postal code, and country. Your profile details will be pre-filled where available.
                </li>
                <li>
                  <strong>Review Order Summary:</strong> Review the item price, shipping cost, and total amount before proceeding.
                </li>
                <li>
                  <strong>Select a Payment Method:</strong> Choose from one of the available payment methods (see Section 6.3 below).
                </li>
                <li>
                  <strong>Complete Payment:</strong> Follow the prompts to finalise your payment. You will be redirected to a confirmation page upon success.
                </li>
                <li>
                  <strong>Order Confirmed:</strong> Once payment is verified, your order status changes to "Processing", shipping is initiated (see Section 7), and confirmation emails are sent to both Buyer and Seller.
                </li>
              </ol>
            </div>

            <p className="font-semibold text-gray-800 mt-4 mb-3">6.3 Accepted Payment Methods</p>
            <p>VeriSpine supports the following payment methods, all denominated in South African Rand (ZAR):</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-900 mb-2">VeriSpine Wallet</p>
                <ul className="text-sm space-y-1">
                  <li>Pay directly from your account balance</li>
                  <li>Instant payment processing</li>
                  <li>Balance must cover the full order total</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-900 mb-2">AddPay</p>
                <ul className="text-sm space-y-1">
                  <li>Visa and Mastercard</li>
                  <li>3D Secure verification</li>
                  <li>Secure card-not-present payments</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-semibold text-gray-900 mb-2">Traderoot</p>
                <ul className="text-sm space-y-1">
                  <li>Visa and Mastercard</li>
                  <li>3D Secure verification</li>
                  <li>Securely tokenized saved cards</li>
                </ul>
              </div>
            </div>

            <p className="font-semibold text-gray-800 mt-4 mb-3">6.4 VeriSpine Wallet</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Users may add funds to their Wallet via AddPay or Traderoot (minimum top-up: R10.00).</li>
              <li>Wallet funds can be used to pay for purchases instantly.</li>
              <li>Wallet balances are displayed in your account dashboard and on the navigation bar.</li>
              <li>Sellers receive sale proceeds into their Wallet balance after deduction of platform fees.</li>
              <li>Seller funds are held as "pending balance" until the order is marked as delivered, at which point they become available for withdrawal.</li>
              <li>Wallet balances are non-transferable between Users except through normal buying/selling activity.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">6.5 Ownership Transfer</p>
            <p>Ownership of an item passes to the Buyer only upon full payment confirmation. Until payment is confirmed, the item remains the property of the Seller.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">6.6 Failed or Cancelled Payments</p>
            <p>If a payment fails or is cancelled, the order will remain in "Pending Payment" status. The Buyer may retry payment using the same or a different payment method. If payment is not completed within a reasonable period, VeriSpine reserves the right to cancel the order and relist the item.</p>
          </section>

          {/* 7. DELIVERY AND SHIPPING */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Delivery and Shipping</h2>

            <p className="font-semibold text-gray-800 mb-3">7.1 Shipping Providers</p>
            <p>VeriSpine uses reliable third-party couriers for domestic deliveries within South Africa. The courier handling your order is shown in your order details once a shipment is created.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">7.2 How Shipping Works</p>
            <div className="bg-amber-50 rounded-lg p-5 my-4">
              <ol className="list-decimal pl-6 space-y-3">
                <li>
                  <strong>Automatic Shipment Creation:</strong> Once your payment is confirmed, a shipment is automatically created with the active courier partner. A unique tracking number is generated and assigned to your order.
                </li>
                <li>
                  <strong>Tracking Number:</strong> Your tracking number will appear in your order details and will also be sent to you via email. You can track your package in real time on the Platform or directly on the courier's tracking website.
                </li>
                <li>
                  <strong>Order Status Updates:</strong> Your order will progress through the following stages:
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li><strong>Pending Payment</strong> - Awaiting payment from the Buyer</li>
                    <li><strong>Processing</strong> - Payment received, preparing for shipment</li>
                    <li><strong>Shipped</strong> - Package handed over to the courier</li>
                    <li><strong>In Transit</strong> - Package is en route to the delivery address</li>
                    <li><strong>Out for Delivery</strong> - Package is with the courier for final delivery</li>
                    <li><strong>Delivered</strong> - Package has been delivered successfully</li>
                  </ul>
                </li>
              </ol>
            </div>

            <p className="font-semibold text-gray-800 mt-4 mb-3">7.3 Shipping Costs</p>
            <p>Shipping costs depend on the active courier and are based on factors including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>The <strong>weight</strong> and <strong>size</strong> (dimensions) of the item</li>
              <li>The <strong>route</strong> between the Seller's location and the Buyer's delivery address</li>
              <li>The selected <strong>courier</strong> and service level (where applicable)</li>
            </ul>
            <p className="mt-2">Where a courier provides live rates, the exact delivery price is calculated at checkout. The shipping cost is always clearly displayed before payment is confirmed. Some Sellers may offer free shipping on their listings.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">7.4 Estimated Delivery Times</p>
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-gray-200 rounded-lg text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Route</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Standard Delivery</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Express Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3">Same Province</td>
                    <td className="px-4 py-3">2 - 3 business days</td>
                    <td className="px-4 py-3">1 - 2 business days</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Adjacent Province</td>
                    <td className="px-4 py-3">3 - 5 business days</td>
                    <td className="px-4 py-3">2 - 3 business days</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Distant Province</td>
                    <td className="px-4 py-3">5 - 7 business days</td>
                    <td className="px-4 py-3">3 - 4 business days</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-600">These are estimated delivery times and are not guaranteed; actual times vary by courier. Delays may occur due to circumstances beyond VeriSpine's control, including public holidays, adverse weather, or courier operational issues.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">7.5 Risk of Loss</p>
            <p>Risk of loss or damage to an item passes to the Buyer upon delivery, unless otherwise agreed between the Buyer and Seller.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">7.6 Delivery Issues</p>
            <p>VeriSpine is not liable for delays, losses, or damage caused by the shipping provider. However, Buyers who experience delivery issues should contact VeriSpine support at <a href="mailto:info@verispinejointcenters.com" className="text-primary-600 hover:underline">info@verispinejointcenters.com</a> for assistance.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">7.7 Delivery Address</p>
            <p>Buyers are responsible for providing a correct and complete delivery address at checkout. VeriSpine is not responsible for items delivered to an incorrect address provided by the Buyer.</p>
          </section>

          {/* 8. RETURNS AND REFUNDS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Returns and Refunds Policy</h2>

            <p className="font-semibold text-gray-800 mb-3">8.1 Cooling-Off Period (CPA Compliance)</p>
            <p>Where applicable under the Consumer Protection Act:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Buyers may cancel a transaction within <strong>7 days</strong> after delivery for distance sales.</li>
              <li>The item must be returned in the same condition as received by the Buyer.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">8.2 Standard Returns Policy</p>
            <p>8.2.1 Buyers may return eligible items within <strong>30 days</strong> of delivery, provided that:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>The item is unused and in original condition</li>
              <li>All original packaging, accessories, and documentation are included</li>
            </ul>

            <p className="mt-3">8.2.2 Returns are <strong>not</strong> permitted for:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Personalised or custom-made items</li>
              <li>Perishable goods</li>
              <li>Digital content once accessed or downloaded</li>
              <li>Items clearly marked "non-returnable"</li>
            </ul>

            <p className="mt-3">8.2.3 Return shipping costs are borne by:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>The <strong>Seller</strong> if the item is defective or misdescribed</li>
              <li>The <strong>Buyer</strong> if the return is for change of mind</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">8.3 Refund Processing</p>
            <p>8.3.1 Refunds are processed within <strong>7-14 business days</strong> after successful return verification.</p>
            <p>8.3.2 Refunds are made to the Buyer's VeriSpine Wallet or using the original payment method, at VeriSpine's discretion.</p>
          </section>

          {/* 9. ORDER CANCELLATION */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Order Cancellation</h2>
            <p>9.1 Orders may only be cancelled while in the following statuses: <strong>Pending Payment</strong>, <strong>Pending</strong>, or <strong>Processing</strong>.</p>
            <p>9.2 Orders that have already been <strong>Shipped</strong> or <strong>Delivered</strong> cannot be cancelled. In such cases, the returns process (Section 8) applies.</p>
            <p>9.3 If a Buy-Now order is cancelled before payment, the item may be relisted for sale.</p>
            <p>9.4 VeriSpine reserves the right to cancel orders in cases of suspected fraud, pricing errors, or policy violations.</p>
          </section>

          {/* 10. SELLER OBLIGATIONS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Seller Obligations</h2>
            <p>Sellers warrant that:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>They are the lawful owner or authorised seller of the item</li>
              <li>Items are accurately described, including condition, specifications, and images</li>
              <li>Items comply with South African law and all applicable regulations</li>
              <li>Items are not counterfeit, stolen, or illegal</li>
              <li>Shipping pickup information (address, city, province, postal code) is accurate</li>
            </ul>
            <p className="mt-3">Failure to comply may result in suspension, removal of listings, forfeiture of pending balances, or legal action.</p>
          </section>

          {/* 11. SELLER PAYMENTS AND WITHDRAWALS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Seller Payments and Withdrawals</h2>
            <p>11.1 When a sale is completed, the Seller's proceeds (after deduction of platform commission) are added to their <strong>pending balance</strong>.</p>
            <p>11.2 Pending balance is released to the Seller's available Wallet balance once the order is marked as <strong>Delivered</strong>.</p>
            <p>11.3 Sellers may request withdrawal of available funds from their Wallet. Withdrawal requests are reviewed by VeriSpine and processed within a reasonable time.</p>
            <p>11.4 VeriSpine reserves the right to withhold Seller funds in cases of disputes, chargebacks, or suspected fraud.</p>
          </section>

          {/* 12. PROHIBITED CONDUCT */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. Prohibited Conduct</h2>
            <p>Users may not:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Bid without intent to purchase ("shill bidding")</li>
              <li>Manipulate auctions or collude with other Users</li>
              <li>Post misleading, defamatory, or unlawful content</li>
              <li>Circumvent fees, payment systems, or platform controls</li>
              <li>Use automated bidding tools without written authorisation from VeriSpine</li>
              <li>Create multiple accounts to circumvent bans or restrictions</li>
              <li>List prohibited or illegal items</li>
            </ul>
          </section>

          {/* 13. INTELLECTUAL PROPERTY */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Intellectual Property</h2>
            <p>13.1 All Platform content, branding, logos, and software belong to VeriSpine or its licensors.</p>
            <p>13.2 Users grant VeriSpine a non-exclusive, royalty-free licence to display listing content (including images and descriptions) for Platform purposes.</p>
          </section>

          {/* 14. PRIVACY AND DATA PROTECTION */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">14. Privacy and Data Protection</h2>

            <p>14.1 Personal data is processed in accordance with the Protection of Personal Information Act 4 of 2013 (POPIA).</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">14.2 Personal Data We Collect</p>
            <p>To operate the Platform, VeriSpine collects the following categories of personal data:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Registration data:</strong> first name, last name, username, email address, password (stored as a one-way hash), and optional phone number</li>
              <li><strong>Identity verification (KYC) data:</strong> identity document (South African ID, Passport, or Driver's Licence), ID number, and a selfie photograph - submitted voluntarily by the User to enable verified status</li>
              <li><strong>Transaction data:</strong> orders placed, bids submitted, payments made, items sold, and Wallet activity</li>
              <li><strong>Shipping data:</strong> full name, delivery address, contact phone number, and email address (collected at checkout)</li>
              <li><strong>Seller / business data:</strong> business name, contact email, bank details (account holder, bank name, account number, branch code) where the User registers as a Seller</li>
              <li><strong>Device and usage data:</strong> IP address, browser type, log timestamps, and similar technical information automatically captured when you use the Platform</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">14.3 Purposes for Which We Use Personal Data (Including Verification)</p>
            <p>VeriSpine uses personal data only for the following specified, lawful purposes:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Account creation and authentication:</strong> verifying that you are a real person, that the email address provided belongs to you (via OTP), and that your login credentials are valid</li>
              <li><strong>Identity verification (KYC):</strong> reviewing submitted identity documents and selfies to confirm a User's identity. This protects all Users from fraud, impersonation, and unauthorised account use. KYC submissions are reviewed manually by VeriSpine administrators and the data is retained only for as long as required to maintain a verified status or to comply with applicable law.</li>
              <li><strong>Seller verification:</strong> evaluating Seller applications and confirming that prospective Sellers meet the requirements set out in Section 10</li>
              <li><strong>Processing transactions:</strong> placing bids, accepting payments, transferring sale proceeds to Sellers, and processing refunds and withdrawals</li>
              <li><strong>Fulfilling delivery:</strong> generating shipping labels and tracking numbers, and arranging the physical delivery of items to the address you provide</li>
              <li><strong>Fraud prevention and platform safety:</strong> detecting suspicious activity such as shill bidding, multiple-account abuse, payment fraud, and other prohibited conduct described in Section 12</li>
              <li><strong>Communications:</strong> sending you transactional emails (order confirmations, payment reminders, shipping updates, withdrawal status) and, where permitted, marketing communications that you can opt out of at any time</li>
              <li><strong>Legal compliance and dispute resolution:</strong> maintaining records required by South African law, responding to lawful requests from regulators or courts, and resolving disputes between Users</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">14.4 Third Parties With Whom We Share Personal Data</p>
            <p>To deliver the services described in Section 14.3, VeriSpine shares limited personal data with the following categories of third-party operators, each of which is contractually bound to process the data only on VeriSpine's behalf and in accordance with POPIA:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Payment gateways:</strong> AddPay and Traderoot - to authorise card payments, process refunds, and confirm transaction outcomes</li>
              <li><strong>Shipping providers:</strong> reliable third-party couriers (and their delivery partners) - to register parcels, generate tracking numbers, and update delivery status</li>
              <li><strong>Email and notification providers:</strong> Resend - to deliver transactional emails on VeriSpine's behalf</li>
              <li><strong>Cloud infrastructure:</strong> Google Cloud / Firebase - to securely host the Platform, authenticate Users, and store records</li>
            </ul>
            <p className="mt-2">VeriSpine does not sell personal data to advertisers or other unrelated third parties.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">14.5 Security Measures</p>
            <p>VeriSpine applies reasonable, industry-standard technical and organisational safeguards to protect personal data, including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Passwords are stored using one-way hashing - they cannot be read or recovered, even by VeriSpine staff</li>
              <li>Sensitive data is transmitted over encrypted HTTPS connections</li>
              <li>Card details are never stored on VeriSpine servers; they are handled directly by our payment gateway partners</li>
              <li>Access to KYC documents is restricted to authorised administrators on a need-to-know basis</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">14.6 Your Rights Under POPIA</p>
            <p>Subject to applicable law, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Request access to the personal data VeriSpine holds about you</li>
              <li>Request correction of inaccurate or incomplete data</li>
              <li>Request deletion of your personal data, subject to retention requirements for completed transactions and legal obligations</li>
              <li>Object to the processing of your data for direct marketing purposes</li>
              <li>Lodge a complaint with the South African Information Regulator (<a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">inforegulator.org.za</a>) if you believe your rights have been infringed</li>
            </ul>
            <p className="mt-2">To exercise any of these rights, contact <a href="mailto:info@verispinejointcenters.com" className="text-primary-600 hover:underline">info@verispinejointcenters.com</a>. We will respond within a reasonable period, typically within 30 days.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">14.7 Consent</p>
            <p>By registering an account, submitting KYC documents, or otherwise providing personal information to VeriSpine, you consent to the collection, use, and sharing of your personal data for the purposes set out in this Section 14. You may withdraw consent at any time by contacting support, subject to the consequence that certain Platform features (such as bidding, selling, or withdrawals) may no longer be available to you.</p>
          </section>

          {/* 15. DISCLAIMERS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">15. Disclaimers and Limitation of Liability</h2>
            <p>15.1 VeriSpine provides the Platform "as is" without warranties of any kind, express or implied.</p>
            <p>15.2 VeriSpine is not liable for:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Seller misrepresentations or inaccurate listings</li>
              <li>Buyer default or failure to complete payment</li>
              <li>Shipping delays, losses, or damage caused by third-party couriers</li>
              <li>Indirect, incidental, or consequential losses</li>
              <li>Platform downtime or technical disruptions</li>
            </ul>
            <p className="mt-2">15.3 VeriSpine's total liability in connection with any claim shall not exceed the amount paid by the User for the specific transaction giving rise to the claim.</p>
          </section>

          {/* 16. INDEMNITY */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">16. Indemnity</h2>
            <p>Users indemnify VeriSpine, its directors, employees, and agents against any claims, losses, or damages arising from:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Breach of these Terms</li>
              <li>Unlawful or fraudulent listings</li>
              <li>Disputes between Buyers and Sellers</li>
              <li>Violation of any third-party rights</li>
            </ul>
          </section>

          {/* 17. SUSPENSION AND TERMINATION */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">17. Suspension and Termination</h2>
            <p>17.1 VeriSpine may suspend or terminate accounts without prior notice for breaches of these Terms, fraudulent activity, or any conduct that VeriSpine deems harmful to the Platform or its Users.</p>
            <p>17.2 Outstanding obligations (including pending payments and deliveries) survive termination.</p>
            <p>17.3 Users may request account deletion by contacting <a href="mailto:info@verispinejointcenters.com" className="text-primary-600 hover:underline">info@verispinejointcenters.com</a>. Pending transactions must be completed or resolved before deletion.</p>
          </section>

          {/* 18. GOVERNING LAW */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">18. Governing Law and Jurisdiction</h2>
            <p>18.1 These Terms are governed by the laws of the Republic of South Africa.</p>
            <p>18.2 The South African courts shall have exclusive jurisdiction over any disputes arising from these Terms.</p>
          </section>

          {/* 19. DISPUTE RESOLUTION */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">19. Dispute Resolution</h2>
            <p>19.1 Parties must attempt to resolve disputes amicably before resorting to legal proceedings.</p>
            <p>19.2 VeriSpine may offer internal dispute resolution mechanisms, including mediation between Buyer and Seller.</p>
            <p>19.3 If a dispute cannot be resolved informally, either party may pursue resolution through the courts as specified in Section 18.</p>
          </section>

          {/* 20. AMENDMENTS */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">20. Amendments</h2>
            <p>20.1 VeriSpine may amend these Terms from time to time. Updated Terms will be posted on the Platform with a revised "Last Updated" date.</p>
            <p>20.2 Continued use of the Platform after an amendment constitutes acceptance of the updated Terms.</p>
            <p>20.3 Where material changes are made, VeriSpine will endeavour to notify Users via email or in-app notification.</p>
          </section>

          {/* 21. AFFILIATE / REFERRAL PROGRAM */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">21. Affiliate / Referral Program</h2>
            <p>VeriSpine operates an optional affiliate (referral) programme that allows eligible Users to earn commission by referring new Users to the Platform.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">21.1 Eligibility</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>To earn commission, a User must <strong>activate</strong> the affiliate programme in their account.</li>
              <li>Activation requires <strong>approved KYC verification</strong> (see Section 3.3).</li>
              <li>A referral link or invitation may be shared with prospective Users. When a new User registers through that link, they are recorded as the referrer's referral.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">21.2 Commission</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>An activated affiliate earns commission of <strong>5% of the item price</strong> (excluding shipping) on purchases made by Users they referred.</li>
              <li>Commission is calculated automatically when a referred User completes a purchase.</li>
              <li>Self-referrals, fraudulent sign-ups, and abuse of the programme are prohibited and may result in forfeiture of commission and account suspension.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">21.3 When Commission Is Paid</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Commission is first held as a <strong>pending</strong> amount and is <strong>not</strong> immediately withdrawable.</li>
              <li>Pending commission is <strong>released to the affiliate's available Wallet balance once the referred order is marked Delivered</strong>, after which it may be withdrawn in accordance with Section 11.</li>
              <li>If a referred order is <strong>cancelled or refunded</strong>, the associated commission is <strong>reversed</strong> and removed (and recovered from the affiliate's balance if it had already been released).</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">21.4 Programme Changes</p>
            <p>VeriSpine may amend, suspend, or discontinue the affiliate programme, or change the commission rate, at any time. Material changes will be reflected in these Terms with a revised "Last Updated" date.</p>
          </section>

          {/* 22. BUYER PROTECTION POLICY */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">22. Buyer Protection Policy</h2>
            <p>At VeriSpine, we are committed to providing a safe and secure online shopping experience. Our Buyer Protection Programme helps protect customers when items purchased through the Platform are not delivered, arrive damaged, or are significantly different from the product description. If a problem occurs with your order, VeriSpine will, to the best of its ability, work to resolve the matter fairly and efficiently. This Section complements (and does not replace) your rights under Sections 8 (Returns and Refunds) and 19 (Dispute Resolution).</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">22.1 What Is Covered</p>
            <p>Buyer Protection applies in the following circumstances:</p>
            <p className="mt-3"><strong>(a) Item Not Received</strong> - you may be eligible for a refund if the logistics partner fails to ship the item, the parcel is lost in transit, tracking confirms non-delivery, or the item is delivered to the wrong address due to a VeriSpine error.</p>
            <p className="mt-2"><strong>(b) Item Arrives Damaged</strong> - you may be eligible for a full or partial refund if the item arrives broken or damaged, the packaging is severely damaged resulting in damage to the item, or the item is unusable due to damage sustained during transport.</p>
            <p className="mt-2"><strong>(c) Item Significantly Different From Description</strong> - you may be eligible for a refund if the wrong item was delivered, the item differs substantially from the photographs or description, or key specifications, features, or functions are materially different from those advertised.</p>
            <p className="mt-2"><strong>(d) Missing Components</strong> - protection may apply if advertised parts or accessories are missing, the shipment is incomplete, or a multiple-item order arrives with items missing.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">22.2 Buyer Protection Period</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Every order is protected for <strong>14 days from confirmed delivery</strong>.</li>
              <li>Orders not delivered within the stated delivery timeframe remain protected until delivery or dispute resolution.</li>
              <li>A dispute must be opened <strong>before</strong> the Buyer Protection Period expires.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">22.3 Evidence Required</p>
            <p>To help resolve disputes, buyers may be required to provide evidence, including: photographs of a damaged item and its packaging (and video where applicable); photographs of an incorrect item compared with the advertised product; or courier tracking screenshots, delivery notifications, and courier communications for missing deliveries. Failure to provide reasonable evidence may affect the outcome of a claim.</p>

            <p className="font-semibold text-gray-800 mt-4 mb-3">22.4 Returns and Refunds Under Buyer Protection</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Depending on the circumstances, VeriSpine may provide a prepaid return label or reimburse reasonable return shipping costs.</li>
              <li>Approved refunds are made to the original payment method or to the buyer's VeriSpine Wallet, and are normally processed within <strong>5-14 business days</strong> after approval.</li>
            </ul>

            <p className="font-semibold text-gray-800 mt-4 mb-3">22.5 Dispute Resolution Process</p>
            <ol className="list-decimal pl-6 space-y-2 mt-2">
              <li><strong>Contact VeriSpine:</strong> first attempt to resolve the matter directly via the VeriSpine messaging/support system.</li>
              <li><strong>Open a Dispute:</strong> if a resolution cannot be reached, open a dispute through your VeriSpine account, including the order number, a description of the problem, supporting evidence, and your desired resolution.</li>
              <li><strong>VeriSpine Mediation:</strong> VeriSpine may review product listings, shipping and tracking records, communications, and the evidence submitted by both parties, and will then issue a decision based on the available evidence.</li>
            </ol>

            <p className="font-semibold text-gray-800 mt-4 mb-3">22.6 VeriSpine Responsibilities and Limits</p>
            <p>VeriSpine will, to the best of its ability, ensure products are accurately described, orders are shipped within the stated timeframe, reliable courier services are used, valid tracking is provided, and dispute investigations are supported. VeriSpine reserves the right to reject claims where fraudulent information is provided, evidence has been altered or fabricated, multiple abusive claims are identified, or the buyer has violated these Terms. VeriSpine may investigate suspected fraud and cooperate with law-enforcement authorities where required.</p>
          </section>

          {/* 23. CONTACT */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">23. Contact Details</h2>
            <div className="bg-gray-50 rounded-lg p-5">
              <p className="font-semibold text-gray-900 mb-3">VeriSpine Joint Centers</p>
              <p>Email: <a href="mailto:info@verispinejointcenters.com" className="text-primary-600 hover:underline">info@verispinejointcenters.com</a></p>
              <p>Website: <a href="https://www.verispinejointcenters.com" className="text-primary-600 hover:underline">www.verispinejointcenters.com</a></p>
              <p>Support Hours: 24 hours a day, 7 days a week</p>
            </div>
          </section>
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

export default Terms
