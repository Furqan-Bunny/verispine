import { useState, useEffect } from 'react'
import { US_STATES, DEFAULT_STATE } from '../config/locale'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from '../config/axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import {
  PhotoIcon,
  TrashIcon,
  ArrowLeftIcon,
  CheckIcon,
  XMarkIcon,
  MapPinIcon
} from '@heroicons/react/24/outline'

interface Category {
  id: string
  name: string
}

interface ShippingOption {
  method: string
  cost: number
  estimatedDays: string
}

const parseDate = (dateValue: any): string => {
  if (!dateValue) return ''
  try {
    // Firestore Timestamp object {_seconds, _nanoseconds}
    if (dateValue._seconds) {
      return new Date(dateValue._seconds * 1000).toISOString().split('T')[0]
    }
    // Already a string like "2026-03-01"
    if (typeof dateValue === 'string') {
      const d = new Date(dateValue)
      return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
    }
    // JS Date object or Firestore Timestamp with toDate()
    if (dateValue.toDate) {
      return dateValue.toDate().toISOString().split('T')[0]
    }
    // Numeric timestamp
    if (typeof dateValue === 'number') {
      return new Date(dateValue).toISOString().split('T')[0]
    }
    return ''
  } catch { return '' }
}

const EditProduct = () => {
  const { productId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  const [formData, setFormData] = useState({
    listingType: 'auction',
    title: '',
    description: '',
    categoryId: '',
    condition: 'new',
    manufacturer: '',
    modelNumber: '',
    yearManufactured: '',
    conditionGrade: '',
    serialNumber: '',
    complianceNotes: '',
    startingPrice: '',
    buyNowPrice: '',
    reservePrice: '',
    incrementAmount: '',
    price: '',
    stockType: 'limited',
    quantity: '',
    soldQuantity: 0,
    endDate: '',
    pickupAddress: '',
    pickupSuburb: '',
    pickupCity: '',
    pickupProvince: '',
    pickupPostalCode: '',
    length: '',
    width: '',
    height: '',
    images: [] as string[],
    shippingOptions: [] as ShippingOption[],
    tags: [] as string[]
  })

  const [newTag, setNewTag] = useState('')
  const [newShipping, setNewShipping] = useState<ShippingOption>({
    method: '',
    cost: 0,
    estimatedDays: ''
  })

  useEffect(() => {
    // Check if user is seller or admin
    if (!user || (user.role !== 'admin' && user.role !== 'seller')) {
      toast.error('Seller privileges required to edit products')
      navigate('/dashboard')
      return
    }

    fetchProduct()
    fetchCategories()
  }, [productId, user])

  const fetchProduct = async () => {
    try {
      const response = await axios.get(`/api/products/${productId}`)
      if (response.data.success) {
        const product = response.data.data
        
        // Only the owning seller (or admin) can edit
        if (product.sellerId !== user?.uid && user?.role !== 'admin') {
          toast.error('You can only edit your own products')
          navigate('/my-auctions')
          return
        }

        // Extract structured pickup fields, with backward compat from legacy location
        let pickupAddress = product.shipping?.pickupAddress || ''
        let pickupSuburb = product.shipping?.pickupSuburb || ''
        let pickupCity = product.shipping?.pickupCity || ''
        let pickupProvince = product.shipping?.pickupProvince || ''
        let pickupPostalCode = product.shipping?.pickupPostalCode || ''

        // Backward compat: parse legacy location string "City, Province" for old products
        if (!pickupCity && product.location) {
          const parts = product.location.split(',').map((p: string) => p.trim())
          pickupCity = parts[0] || ''
          pickupProvince = parts[1] || ''
        }

        setFormData({
          listingType: product.listingType || 'auction',
          title: product.title || '',
          description: product.description || '',
          categoryId: product.categoryId || '',
          condition: product.condition || 'new',
          manufacturer: product.manufacturer || '',
          modelNumber: product.modelNumber || '',
          yearManufactured: product.yearManufactured?.toString() || '',
          conditionGrade: product.conditionGrade || '',
          serialNumber: product.serialNumber || '',
          complianceNotes: product.complianceNotes || '',
          startingPrice: product.startingPrice?.toString() || '',
          buyNowPrice: product.buyNowPrice?.toString() || '',
          reservePrice: product.reservePrice?.toString() || '',
          incrementAmount: product.incrementAmount?.toString() || '',
          price: product.price?.toString() || '',
          stockType: product.stockType === 'unlimited' ? 'unlimited' : 'limited',
          quantity: product.quantity?.toString() || '',
          soldQuantity: Number(product.soldQuantity || 0),
          length: product.dimensions?.length?.toString() || '',
          width: product.dimensions?.width?.toString() || '',
          height: product.dimensions?.height?.toString() || '',
          endDate: parseDate(product.endDate),
          pickupAddress,
          pickupSuburb,
          pickupCity,
          pickupProvince,
          pickupPostalCode,
          images: product.images || [],
          shippingOptions: product.shippingOptions || [],
          tags: product.tags || []
        })
      }
    } catch (error) {
      console.error('Error fetching product:', error)
      toast.error('Failed to load product')
      navigate('/admin/products')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await axios.get('/api/categories')
      if (response.data.success) {
        setCategories(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
      toast.error('Failed to load categories')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // In a real app, upload to storage and get URL
      // For now, using local URL
      const imageUrl = URL.createObjectURL(file)
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, imageUrl]
      }))
    }
  }

  const handleImageRemove = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }

  const handleTagAdd = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }))
      setNewTag('')
    }
  }

  const handleTagRemove = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }))
  }

  const handleShippingAdd = () => {
    if (newShipping.method && newShipping.cost >= 0) {
      setFormData(prev => ({
        ...prev,
        shippingOptions: [...prev.shippingOptions, { ...newShipping }]
      }))
      setNewShipping({ method: '', cost: 0, estimatedDays: '' })
    }
  }

  const handleShippingRemove = (index: number) => {
    setFormData(prev => ({
      ...prev,
      shippingOptions: prev.shippingOptions.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const updateData: any = {
        title: formData.title,
        description: formData.description,
        categoryId: formData.categoryId,
        condition: formData.condition,
        // Always sent, including when blank: an emptied field must clear the
        // stored value, and the backend normalizes '' to null.
        manufacturer: formData.manufacturer,
        modelNumber: formData.modelNumber,
        yearManufactured: formData.yearManufactured,
        conditionGrade: formData.conditionGrade,
        serialNumber: formData.serialNumber,
        complianceNotes: formData.complianceNotes,
        images: formData.images,
        shippingOptions: formData.shippingOptions,
        tags: formData.tags,
        shipping: JSON.stringify({
          pickupAddress: formData.pickupAddress.trim(),
          pickupSuburb: formData.pickupSuburb.trim(),
          pickupCity: formData.pickupCity.trim(),
          pickupProvince: formData.pickupProvince,
          pickupPostalCode: formData.pickupPostalCode.trim(),
          location: `${formData.pickupCity.trim()}, ${formData.pickupProvince}`
        })
      }

      // Optional parcel dimensions (cm) — sent only when all three are provided
      if (formData.length && formData.width && formData.height) {
        updateData.dimensions = JSON.stringify({
          length: parseFloat(formData.length),
          width: parseFloat(formData.width),
          height: parseFloat(formData.height)
        })
      }

      if (formData.listingType === 'sale') {
        // Fixed-price product: only price + stock are editable.
        if (formData.price) updateData.price = parseFloat(formData.price)
        if (formData.quantity) updateData.quantity = parseInt(formData.quantity, 10)
      } else {
        // Only include price fields if they have values
        if (formData.startingPrice) updateData.startingPrice = parseFloat(formData.startingPrice)
        if (formData.buyNowPrice) updateData.buyNowPrice = parseFloat(formData.buyNowPrice)
        if (formData.reservePrice) updateData.reservePrice = parseFloat(formData.reservePrice)
        if (formData.incrementAmount) updateData.incrementAmount = parseFloat(formData.incrementAmount)
        if (formData.endDate) updateData.endDate = formData.endDate
      }

      const response = await axios.put(`/api/products/${productId}`, updateData)

      if (response.data.success) {
        toast.success('Product updated successfully')
        navigate('/admin/products')
      }
    } catch (error: any) {
      console.error('Error updating product:', error)
      toast.error(error.response?.data?.error || 'Failed to update product')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(user?.role === 'admin' ? '/admin/products' : '/my-auctions')}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="h-5 w-5 mr-2" />
          Back to Products
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
        {/* Basic Information */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                rows={4}
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <select
                  name="categoryId"
                  value={formData.categoryId}
                  onChange={handleInputChange}
                  required
                  className="input-field"
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <select
                  name="condition"
                  value={formData.condition}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  <option value="new">New</option>
                  <option value="like-new">Like New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
              </div>
            </div>

            {/* Equipment provenance — mirrors the Create form so a listing can be
                completed after the fact rather than only at creation. */}
            <div className="mt-6 border border-gray-200 rounded-lg p-5 bg-gray-50">
              <h3 className="font-semibold text-gray-900 mb-4">Equipment Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                  <input type="text" name="manufacturer" value={formData.manufacturer}
                    onChange={handleInputChange} placeholder="e.g. GE Healthcare" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Number</label>
                  <input type="text" name="modelNumber" value={formData.modelNumber}
                    onChange={handleInputChange} placeholder="e.g. OEC 9900 Elite" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year Manufactured</label>
                  <input type="number" name="yearManufactured" value={formData.yearManufactured}
                    onChange={handleInputChange} min={1950} max={new Date().getFullYear() + 1}
                    placeholder="e.g. 2018" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input type="text" name="serialNumber" value={formData.serialNumber}
                    onChange={handleInputChange} placeholder="Optional" className="input-field" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condition Grade</label>
                  <select name="conditionGrade" value={formData.conditionGrade}
                    onChange={handleInputChange} className="input-field">
                    <option value="">Not specified</option>
                    <option value="new">New — unused, in original packaging</option>
                    <option value="refurbished">Refurbished — professionally restored and tested</option>
                    <option value="used-working">Used, Working — functional, normal wear</option>
                    <option value="for-parts">For Parts / Not Working — not for clinical use</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Compliance &amp; Certification Notes
                  </label>
                  <textarea name="complianceNotes" value={formData.complianceNotes}
                    onChange={handleInputChange} rows={3}
                    placeholder="Service history, calibration records, FDA/registration status, or any restrictions on resale or clinical use."
                    className="input-field" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>

          {formData.listingType === 'sale' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (R) *
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                  min="0"
                  step="0.01"
                  className="input-field"
                />
              </div>
              {formData.stockType === 'unlimited' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock
                  </label>
                  <div className="input-field bg-gray-50 text-gray-700">Always available</div>
                  <p className="mt-1 text-xs text-gray-500">
                    Stays in stock until marked out of stock.{formData.soldQuantity > 0 ? ` ${formData.soldQuantity} sold so far.` : ''}
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity in stock *
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    required
                    min={Math.max(1, formData.soldQuantity)}
                    step="1"
                    className="input-field"
                  />
                  {formData.soldQuantity > 0 && (
                    <p className="mt-1 text-xs text-gray-500">{formData.soldQuantity} already sold — can't go below this.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Starting Price (R) *
              </label>
              <input
                type="number"
                name="startingPrice"
                value={formData.startingPrice}
                onChange={handleInputChange}
                required
                min="0"
                step="0.01"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buy Now Price (R)
              </label>
              <input
                type="number"
                name="buyNowPrice"
                value={formData.buyNowPrice}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reserve Price (R)
              </label>
              <input
                type="number"
                name="reservePrice"
                value={formData.reservePrice}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bid Increment (R)
              </label>
              <input
                type="number"
                name="incrementAmount"
                value={formData.incrementAmount}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                className="input-field"
              />
            </div>
          </div>
          )}
        </div>

        {/* Auction Details (auctions only) */}
        {formData.listingType !== 'sale' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Auction Details</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              name="endDate"
              value={formData.endDate}
              onChange={handleInputChange}
              min={new Date().toISOString().split('T')[0]}
              className="input-field"
            />
          </div>
        </div>
        )}

        {/* Pickup Location */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pickup Location (where the courier collects the item)</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street Address *
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="pickupAddress"
                  value={formData.pickupAddress}
                  onChange={handleInputChange}
                  placeholder="e.g., 4319 Covington Hwy"
                  maxLength={105}
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Suburb *
              </label>
              <input
                type="text"
                name="pickupSuburb"
                value={formData.pickupSuburb}
                onChange={handleInputChange}
                placeholder="e.g., Suite 102"
                maxLength={100}
                className="input-field"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City *
                </label>
                <input
                  type="text"
                  name="pickupCity"
                  value={formData.pickupCity}
                  onChange={handleInputChange}
                  placeholder="e.g., Atlanta"
                  maxLength={35}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State *
                </label>
                <select
                  name="pickupProvince"
                  value={formData.pickupProvince}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  <option value="">Select state</option>
                  {US_STATES.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ZIP Code *
                </label>
                <input
                  type="text"
                  name="pickupPostalCode"
                  value={formData.pickupPostalCode}
                  onChange={handleInputChange}
                  placeholder="e.g., 30035"
                  maxLength={10}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Parcel dimensions (optional, for courier rates) */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Parcel Dimensions (in)</h2>
          <p className="text-sm text-gray-500 mb-3">Optional. Used for carrier rate accuracy. Leave blank to use a default size based on weight.</p>
          <div className="grid grid-cols-3 gap-3">
            {(['length', 'width', 'height'] as const).map((dim) => (
              <input
                key={dim}
                type="number"
                name={dim}
                value={(formData as any)[dim]}
                onChange={handleInputChange}
                placeholder={dim.charAt(0).toUpperCase() + dim.slice(1)}
                min="1"
                max="200"
                step="0.1"
                className="input-field"
              />
            ))}
          </div>
        </div>

        {/* Images */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Images</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {formData.images.map((image, index) => (
              <div key={index} className="relative">
                <img
                  src={image}
                  alt={`Product ${index + 1}`}
                  className="w-full h-24 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => handleImageRemove(index)}
                  className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            
            <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400">
              <PhotoIcon className="h-8 w-8 text-gray-400" />
              <span className="mt-2 text-xs text-gray-600">Add Image</span>
              <input
                type="file"
                onChange={handleImageAdd}
                accept="image/*"
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Tags */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.tags.map(tag => (
              <span key={tag} className="px-3 py-1 bg-gray-100 rounded-full text-sm flex items-center">
                {tag}
                <button
                  type="button"
                  onClick={() => handleTagRemove(tag)}
                  className="ml-2 text-gray-500 hover:text-red-600"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            ))}
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add a tag"
              className="input-field flex-1"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleTagAdd())}
            />
            <button
              type="button"
              onClick={handleTagAdd}
              className="btn-secondary"
            >
              Add Tag
            </button>
          </div>
        </div>

        {/* Shipping Options */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipping Options</h2>
          
          <div className="space-y-2 mb-4">
            {formData.shippingOptions.map((option, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium">{option.method}</span>
                  <span className="ml-3 text-gray-600">${option.cost}</span>
                  {option.estimatedDays && (
                    <span className="ml-2 text-sm text-gray-500">({option.estimatedDays})</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleShippingRemove(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              value={newShipping.method}
              onChange={(e) => setNewShipping(prev => ({ ...prev, method: e.target.value }))}
              placeholder="Shipping method"
              className="input-field"
            />
            <input
              type="number"
              value={newShipping.cost}
              onChange={(e) => setNewShipping(prev => ({ ...prev, cost: parseFloat(e.target.value) }))}
              placeholder="Cost (R)"
              min="0"
              step="0.01"
              className="input-field"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newShipping.estimatedDays}
                onChange={(e) => setNewShipping(prev => ({ ...prev, estimatedDays: e.target.value }))}
                placeholder="Est. days"
                className="input-field"
              />
              <button
                type="button"
                onClick={handleShippingAdd}
                className="btn-secondary"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex-1"
          >
            {saving ? 'Updating...' : 'Update Product'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/products')}
            className="btn-outline flex-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  )
}

export default EditProduct