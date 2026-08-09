import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PlusIcon,
  PhotoIcon,
  TrashIcon,
  InformationCircleIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  TagIcon,
  MapPinIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import axios from '../config/axios'
import { SUPPORTED_CITIES } from '../config/cities'
import CitySelect from '../components/CitySelect'

interface Category {
  id: string
  name: string
}

const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape'
] as const

type ListingType = '' | 'auction' | 'sale'

interface AuctionFormData {
  listingType: ListingType
  title: string
  description: string
  category: string
  condition: 'new' | 'like-new' | 'excellent' | 'good' | 'fair' | 'poor'
  startingPrice: string
  reservePrice: string
  buyNowPrice: string
  incrementAmount: string
  price: string
  stockType: 'limited' | 'unlimited'
  quantity: string
  duration: string
  shippingCost: string
  freeShipping: boolean
  pickupAddress: string
  pickupSuburb: string
  pickupCity: string
  pickupProvince: string
  pickupPostalCode: string
  weight: string
  length: string
  width: string
  height: string
  images: File[]
  featured: boolean
  isLiveAuction: boolean
  registrationFee: string
  scheduleForLater: boolean
  scheduledStartTime: string
}

const CreateAuction = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [formData, setFormData] = useState<AuctionFormData>({
    listingType: '',
    title: '',
    description: '',
    category: '',
    condition: 'excellent',
    startingPrice: '',
    reservePrice: '',
    buyNowPrice: '',
    incrementAmount: '',
    price: '',
    stockType: 'limited',
    quantity: '1',
    duration: '7',
    shippingCost: '',
    freeShipping: false,
    pickupAddress: '',
    pickupSuburb: '',
    pickupCity: '',
    pickupProvince: '',
    pickupPostalCode: '',
    weight: '',
    length: '',
    width: '',
    height: '',
    images: [],
    featured: false,
    isLiveAuction: false,
    registrationFee: '5',
    scheduleForLater: false,
    scheduledStartTime: ''
  })
  const [imagePreview, setImagePreview] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [errors, setErrors] = useState<{ [key: string]: string }>({})

  // Check if user is seller or admin and fetch categories
  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'seller') {
      toast.error('Access denied. Seller privileges required.')
      navigate('/dashboard')
    }
    fetchCategories()
  }, [user, navigate])

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
    const { name, value, type } = e.target
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
    if (formData.images.length + files.length > 5) {
      toast.error('Maximum 5 images allowed')
      return
    }

    const validFiles = files.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Max 5MB per image.`)
        return false
      }
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not a valid image file.`)
        return false
      }
      return true
    })

    setFormData(prev => ({
      ...prev,
      images: [...prev.images, ...validFiles]
    }))

    // Create preview URLs
    validFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(prev => [...prev, e.target?.result as string])
      }
      reader.readAsDataURL(file)
    })
  }

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
    setImagePreview(prev => prev.filter((_, i) => i !== index))
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {}

    const isSale = formData.listingType === 'sale'

    if (!formData.title.trim()) newErrors.title = 'Title is required'
    if (!formData.description.trim()) newErrors.description = 'Description is required'
    if (!formData.category) newErrors.category = 'Category is required'
    if (isSale) {
      // Fixed-price listing: needs a price and stock quantity, not auction pricing.
      if (!formData.price || parseFloat(formData.price) <= 0) {
        newErrors.price = 'Price must be greater than 0'
      }
      // Quantity is only required for limited stock. "Always available" has no quantity.
      if (formData.stockType === 'limited' &&
          (!formData.quantity || !Number.isInteger(Number(formData.quantity)) || parseInt(formData.quantity, 10) < 1)) {
        newErrors.quantity = 'Quantity must be a whole number of at least 1'
      }
    } else {
      if (!formData.startingPrice || parseFloat(formData.startingPrice) <= 0) {
        newErrors.startingPrice = 'Starting price must be greater than 0'
      }
      if (!formData.incrementAmount || parseFloat(formData.incrementAmount) <= 0) {
        newErrors.incrementAmount = 'Increment amount must be greater than 0'
      }
    }
    if (!formData.pickupAddress.trim()) {
      newErrors.pickupAddress = 'Pickup address is required'
    } else if (formData.pickupAddress.trim().length > 105) {
      newErrors.pickupAddress = 'Address must be 105 characters or less'
    }
    if (!formData.pickupSuburb.trim()) {
      newErrors.pickupSuburb = 'Suburb is required'
    } else if (formData.pickupSuburb.trim().length > 100) {
      newErrors.pickupSuburb = 'Suburb must be 100 characters or less'
    }
    if (!formData.pickupCity.trim()) {
      newErrors.pickupCity = 'City is required'
    } else if (!SUPPORTED_CITIES.includes(formData.pickupCity as any)) {
      newErrors.pickupCity = 'Please select a supported delivery city'
    }
    if (!formData.pickupProvince) newErrors.pickupProvince = 'Province is required'
    if (!formData.pickupPostalCode.trim()) {
      newErrors.pickupPostalCode = 'Postal code is required'
    } else if (!/^\d{4}$/.test(formData.pickupPostalCode.trim())) {
      newErrors.pickupPostalCode = 'Postal code must be exactly 4 digits'
    }
    if (!formData.weight || parseFloat(formData.weight) <= 0) {
      newErrors.weight = 'Weight is required (in kg) for shipping'
    } else if (parseFloat(formData.weight) > 30) {
      newErrors.weight = 'Weight must be 30 kg or less'
    } else if (parseFloat(formData.weight) < 0.1) {
      newErrors.weight = 'Weight must be at least 0.1 kg'
    }
    if (formData.images.length === 0) newErrors.images = 'At least one image is required'

    // Validate reserve price
    if (formData.reservePrice && parseFloat(formData.reservePrice) < parseFloat(formData.startingPrice)) {
      newErrors.reservePrice = 'Reserve price must be greater than or equal to starting price'
    }

    // Validate buy now price
    if (formData.buyNowPrice && parseFloat(formData.buyNowPrice) <= parseFloat(formData.startingPrice)) {
      newErrors.buyNowPrice = 'Buy Now price must be greater than starting price'
    }

    // Validate shipping
    if (!formData.freeShipping && (!formData.shippingCost || parseFloat(formData.shippingCost) < 0)) {
      newErrors.shippingCost = 'Shipping cost is required when not offering free shipping'
    }

    // Validate scheduled start time
    if (formData.scheduleForLater) {
      if (!formData.scheduledStartTime) {
        newErrors.scheduledStartTime = 'Scheduled start time is required'
      } else {
        const scheduledDate = new Date(formData.scheduledStartTime)
        const minDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
        if (scheduledDate < minDate) {
          newErrors.scheduledStartTime = 'Scheduled time must be at least 1 hour from now'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      toast.error('Please fix the errors before submitting')
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare form data for multipart upload
      const formDataToSend = new FormData()
      formDataToSend.append('title', formData.title)
      formDataToSend.append('description', formData.description)
      
      // Find the category name from the ID
      const selectedCategory = categories.find(c => c.id === formData.category)
      formDataToSend.append('category', selectedCategory?.name || '')
      formDataToSend.append('categoryId', formData.category)
      const isSale = formData.listingType === 'sale'
      formDataToSend.append('listingType', isSale ? 'sale' : 'auction')
      formDataToSend.append('condition', formData.condition)
      formDataToSend.append('weight', formData.weight)

      // Optional parcel dimensions (cm) — only sent when all three are provided
      if (formData.length && formData.width && formData.height) {
        formDataToSend.append('dimensions', JSON.stringify({
          length: parseFloat(formData.length),
          width: parseFloat(formData.width),
          height: parseFloat(formData.height)
        }))
      }

      if (isSale) {
        // Fixed-price listing: send price + stock, no auction pricing/dates.
        formDataToSend.append('price', formData.price)
        formDataToSend.append('stockType', formData.stockType)
        // Quantity only matters for limited stock; unlimited ("always available") has none.
        if (formData.stockType === 'limited') {
          formDataToSend.append('quantity', formData.quantity || '1')
        }
      } else {
        formDataToSend.append('startingPrice', formData.startingPrice)
        formDataToSend.append('incrementAmount', formData.incrementAmount || '100')
        formDataToSend.append('buyNowPrice', formData.buyNowPrice)

        // Calculate end date based on duration
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + parseInt(formData.duration))
        formDataToSend.append('endDate', endDate.toISOString())
      }
      
      // Add shipping info
      const shipping = {
        cost: formData.freeShipping ? 0 : parseFloat(formData.shippingCost || '0'),
        location: `${formData.pickupCity}, ${formData.pickupProvince}`,
        pickupAddress: formData.pickupAddress.trim(),
        pickupSuburb: formData.pickupSuburb.trim(),
        pickupCity: formData.pickupCity.trim(),
        pickupProvince: formData.pickupProvince,
        pickupPostalCode: formData.pickupPostalCode.trim(),
        methods: ['Standard Shipping']
      }
      formDataToSend.append('shipping', JSON.stringify(shipping))
      
      // Add specifications (empty for now)
      formDataToSend.append('specifications', JSON.stringify({}))

      // Add live auction settings
      formDataToSend.append('isLiveAuction', String(formData.isLiveAuction))
      if (formData.isLiveAuction) {
        formDataToSend.append('registrationFee', formData.registrationFee || '5')
      }

      // Add scheduling info
      if (formData.scheduleForLater && formData.scheduledStartTime) {
        formDataToSend.append('scheduledStartTime', new Date(formData.scheduledStartTime).toISOString())
        formDataToSend.append('duration', formData.duration)
      }
      
      // Add images
      formData.images.forEach((image) => {
        formDataToSend.append('images', image)
      })
      
      // Send to backend
      const response = await axios.post('/api/products', formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      if (response.data.success) {
        toast.success(formData.scheduleForLater ? 'Auction scheduled successfully!' : 'Product created successfully!')
        console.log('Product created:', response.data.data)
      
      // Reset form
      setFormData({
        listingType: formData.listingType,
        title: '',
        description: '',
        category: '',
        condition: 'excellent',
        startingPrice: '',
        reservePrice: '',
        buyNowPrice: '',
        incrementAmount: '',
        price: '',
        stockType: 'limited',
        quantity: '1',
        duration: '7',
        shippingCost: '',
        freeShipping: false,
        pickupAddress: '',
        pickupSuburb: '',
        pickupCity: '',
        pickupProvince: '',
        pickupPostalCode: '',
        weight: '',
        length: '',
        width: '',
        height: '',
        images: [],
        featured: false,
        isLiveAuction: false,
        registrationFee: '5',
        scheduleForLater: false,
        scheduledStartTime: ''
      })
      setImagePreview([])
      setCurrentStep(1)
      
        // Navigate to product listing or admin dashboard
        setTimeout(() => {
          navigate('/admin/products')
        }, 1500)
      } else {
        toast.error('Failed to create product')
      }
    } catch (error: any) {
      console.error('Error creating product:', error)
      toast.error(error.response?.data?.error || 'Failed to create product. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = [
    { id: 1, title: 'Basic Info', description: 'Title, description, and category' },
    { id: 2, title: 'Images', description: 'Upload product images' },
    { id: 3, title: 'Pricing', description: 'Set starting price and auction details' },
    { id: 4, title: 'Shipping', description: 'Shipping and location details' },
    { id: 5, title: 'Review', description: 'Review and submit' }
  ]

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auction Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter a descriptive title for your auction"
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.title ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.category ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value="">Select a category</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-sm text-red-600">{errors.category}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Condition *
              </label>
              <select
                name="condition"
                value={formData.condition}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="new">New</option>
                <option value="like-new">Like New</option>
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={6}
                placeholder="Provide detailed information about the item, including specifications, condition details, and any other relevant information buyers should know."
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.description ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Images * (Max 5 images, 5MB each)
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  <PhotoIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">
                    Click to upload images or drag and drop
                  </p>
                  <p className="text-sm text-gray-500">
                    PNG, JPG, GIF up to 5MB each
                  </p>
                </label>
              </div>
              {errors.images && <p className="mt-1 text-sm text-red-600">{errors.images}</p>}
            </div>

            {imagePreview.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {imagePreview.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-32 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                    {index === 0 && (
                      <span className="absolute bottom-2 left-2 bg-primary-500 text-white px-2 py-1 rounded text-xs font-medium">
                        Main
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 3:
        if (formData.listingType === 'sale') {
          return (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price (ZAR) *
                </label>
                <div className="relative">
                  <CurrencyDollarIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.price ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.price && <p className="mt-1 text-sm text-red-600">{errors.price}</p>}
              </div>

              {/* Stock mode: a fixed quantity, or "always available" until marked out of stock. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stock</label>
                <div className="space-y-3">
                  <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                    formData.stockType === 'limited' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="stockType"
                      value="limited"
                      checked={formData.stockType === 'limited'}
                      onChange={() => setFormData(prev => ({ ...prev, stockType: 'limited' }))}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">Limited stock</span>
                      <span className="block text-xs text-gray-500">Sell a set number of units. Goes out of stock automatically at 0.</span>
                    </span>
                  </label>

                  <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer ${
                    formData.stockType === 'unlimited' ? 'border-primary-500 bg-primary-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      name="stockType"
                      value="unlimited"
                      checked={formData.stockType === 'unlimited'}
                      onChange={() => setFormData(prev => ({ ...prev, stockType: 'unlimited' }))}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">Always available</span>
                      <span className="block text-xs text-gray-500">Stays in stock no matter how many sell — until you (or an admin) mark it out of stock.</span>
                    </span>
                  </label>
                </div>

                {formData.stockType === 'limited' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quantity in stock *
                    </label>
                    <div className="relative">
                      <TagIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                      <input
                        type="number"
                        name="quantity"
                        value={formData.quantity}
                        onChange={handleInputChange}
                        placeholder="1"
                        min="1"
                        step="1"
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          errors.quantity ? 'border-red-300' : 'border-gray-300'
                        }`}
                      />
                    </div>
                    {errors.quantity && <p className="mt-1 text-sm text-red-600">{errors.quantity}</p>}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex">
                <InformationCircleIcon className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <p className="ml-3 text-sm text-blue-700">
                  This is a fixed-price listing. Buyers purchase instantly at this price — there's no bidding.{' '}
                  {formData.stockType === 'unlimited'
                    ? "The listing stays live until you mark it out of stock."
                    : `The listing stays live until all ${formData.quantity || '1'} unit(s) are sold.`}
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="featured"
                  name="featured"
                  checked={formData.featured}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="featured" className="text-sm font-medium text-gray-700">
                  Feature this product (appears in featured section)
                </label>
              </div>
            </div>
          )
        }
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Starting Price (ZAR) *
                </label>
                <div className="relative">
                  <CurrencyDollarIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    name="startingPrice"
                    value={formData.startingPrice}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.startingPrice ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.startingPrice && <p className="mt-1 text-sm text-red-600">{errors.startingPrice}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bid Increment (ZAR) *
                </label>
                <div className="relative">
                  <TagIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    name="incrementAmount"
                    value={formData.incrementAmount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.incrementAmount ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.incrementAmount && <p className="mt-1 text-sm text-red-600">{errors.incrementAmount}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reserve Price (ZAR)
                  <span className="text-gray-500 text-sm ml-1">(Optional)</span>
                </label>
                <input
                  type="number"
                  name="reservePrice"
                  value={formData.reservePrice}
                  onChange={handleInputChange}
                  placeholder="Minimum acceptable price"
                  min="0"
                  step="0.01"
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.reservePrice ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.reservePrice && <p className="mt-1 text-sm text-red-600">{errors.reservePrice}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buy Now Price (ZAR)
                  <span className="text-gray-500 text-sm ml-1">(Optional)</span>
                </label>
                <input
                  type="number"
                  name="buyNowPrice"
                  value={formData.buyNowPrice}
                  onChange={handleInputChange}
                  placeholder="Instant purchase price"
                  min="0"
                  step="0.01"
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.buyNowPrice ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.buyNowPrice && <p className="mt-1 text-sm text-red-600">{errors.buyNowPrice}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auction Duration
              </label>
              <select
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="5">5 days</option>
                <option value="7">7 days</option>
                <option value="10">10 days</option>
                <option value="14">14 days</option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="featured"
                name="featured"
                checked={formData.featured}
                onChange={handleInputChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="featured" className="text-sm font-medium text-gray-700">
                Feature this auction (appears in featured section)
              </label>
            </div>

            {/* Live Auction Option */}
            <div className="border-t pt-6 mt-6">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isLiveAuction"
                  name="isLiveAuction"
                  checked={formData.isLiveAuction}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <label htmlFor="isLiveAuction" className="text-sm font-medium text-gray-700">
                  Make this a Live Auction (requires registration fee to bid)
                </label>
              </div>

              {formData.isLiveAuction && (
                <div className="mt-4 ml-7">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Registration Fee (ZAR)
                  </label>
                  <input
                    type="number"
                    name="registrationFee"
                    value={formData.registrationFee}
                    onChange={handleInputChange}
                    placeholder="5"
                    min="1"
                    step="1"
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Users must pay this fee from their wallet to participate in bidding
                  </p>
                </div>
              )}

              {formData.isLiveAuction && (
                <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex">
                    <InformationCircleIcon className="h-5 w-5 text-orange-400 flex-shrink-0" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-orange-800">Live Auction</h3>
                      <p className="mt-1 text-sm text-orange-700">
                        Bidders will need to pay R{formData.registrationFee || 5} registration fee before they can place bids.
                        This helps ensure serious bidders only.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Schedule Auction Option */}
            <div className="border-t pt-6 mt-6">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="scheduleForLater"
                  name="scheduleForLater"
                  checked={formData.scheduleForLater}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="scheduleForLater" className="text-sm font-medium text-gray-700">
                  Schedule this auction for later
                </label>
              </div>

              {formData.scheduleForLater && (
                <div className="mt-4 ml-7">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <CalendarIcon className="inline h-4 w-4 mr-1" />
                    Go-Live Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    name="scheduledStartTime"
                    value={formData.scheduledStartTime}
                    onChange={handleInputChange}
                    min={new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.scheduledStartTime ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {errors.scheduledStartTime && (
                    <p className="mt-1 text-sm text-red-600">{errors.scheduledStartTime}</p>
                  )}

                  {formData.scheduledStartTime && (
                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex">
                        <InformationCircleIcon className="h-5 w-5 text-blue-400 flex-shrink-0" />
                        <div className="ml-3">
                          <p className="text-sm text-blue-700">
                            This auction will go live on{' '}
                            <strong>
                              {new Date(formData.scheduledStartTime).toLocaleDateString('en-ZA', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}{' '}
                              at{' '}
                              {new Date(formData.scheduledStartTime).toLocaleTimeString('en-ZA', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </strong>{' '}
                            and will run for {formData.duration} day(s). All users will be notified.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <h3 className="text-md font-medium text-gray-800">Pickup Location (where the courier collects the item)</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Street Address *
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="pickupAddress"
                  value={formData.pickupAddress}
                  onChange={handleInputChange}
                  placeholder="e.g., 12 Long Street"
                  maxLength={105}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.pickupAddress ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.pickupAddress && <p className="mt-1 text-sm text-red-600">{errors.pickupAddress}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Suburb *
              </label>
              <div className="relative">
                <MapPinIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  name="pickupSuburb"
                  value={formData.pickupSuburb}
                  onChange={handleInputChange}
                  placeholder="e.g., Gardens"
                  maxLength={100}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.pickupSuburb ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.pickupSuburb && <p className="mt-1 text-sm text-red-600">{errors.pickupSuburb}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  City *
                </label>
                <CitySelect
                  value={formData.pickupCity}
                  onChange={(city) => setFormData(prev => ({ ...prev, pickupCity: city }))}
                  hasError={!!errors.pickupCity}
                />
                <p className="mt-1 text-xs text-gray-500">Type to search. We currently deliver in these cities only.</p>
                {errors.pickupCity && <p className="mt-1 text-sm text-red-600">{errors.pickupCity}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Province *
                </label>
                <select
                  name="pickupProvince"
                  value={formData.pickupProvince}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.pickupProvince ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select province</option>
                  {SA_PROVINCES.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
                {errors.pickupProvince && <p className="mt-1 text-sm text-red-600">{errors.pickupProvince}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Postal Code *
                </label>
                <input
                  type="text"
                  name="pickupPostalCode"
                  value={formData.pickupPostalCode}
                  onChange={handleInputChange}
                  placeholder="e.g., 8001"
                  maxLength={4}
                  className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                    errors.pickupPostalCode ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.pickupPostalCode && <p className="mt-1 text-sm text-red-600">{errors.pickupPostalCode}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parcel Weight (kg) *
              </label>
              <input
                type="number"
                name="weight"
                value={formData.weight}
                onChange={handleInputChange}
                placeholder="e.g., 1.5"
                min="0.1"
                max="30"
                step="0.1"
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  errors.weight ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              <p className="mt-1 text-xs text-gray-500">Required for courier shipping. Range: 0.1 - 30 kg.</p>
              {errors.weight && <p className="mt-1 text-sm text-red-600">{errors.weight}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parcel Dimensions (cm) <span className="text-gray-500 text-sm ml-1">(Optional — used for courier rates)</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['length', 'width', 'height'] as const).map((dim) => (
                  <input
                    key={dim}
                    type="number"
                    name={dim}
                    value={formData[dim]}
                    onChange={handleInputChange}
                    placeholder={dim.charAt(0).toUpperCase() + dim.slice(1)}
                    min="1"
                    max="200"
                    step="0.1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">Leave blank to use a default size based on weight. Improves courier quote accuracy.</p>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="freeShipping"
                name="freeShipping"
                checked={formData.freeShipping}
                onChange={handleInputChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="freeShipping" className="text-sm font-medium text-gray-700">
                Offer free shipping
              </label>
            </div>

            {!formData.freeShipping && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Shipping Cost (ZAR) *
                </label>
                <div className="relative">
                  <TruckIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input
                    type="number"
                    name="shippingCost"
                    value={formData.shippingCost}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.shippingCost ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.shippingCost && <p className="mt-1 text-sm text-red-600">{errors.shippingCost}</p>}
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <InformationCircleIcon className="h-5 w-5 text-blue-400 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Shipping Information</h3>
                  <p className="mt-1 text-sm text-blue-700">
                    The courier will pick up the item from the address above and deliver it to the buyer.
                    Please ensure the address is accurate for smooth collection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Auction Summary</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Title:</span>
                    <p className="font-medium">{formData.title}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Category:</span>
                    <p className="font-medium">
                      {categories.find(c => c.id === formData.category)?.name || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-600">Description:</span>
                  <p className="text-sm text-gray-700 mt-1">{formData.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {formData.listingType === 'sale' ? (
                    <>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Price:</span>
                        <p className="font-medium">R{parseFloat(formData.price || '0').toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Stock:</span>
                        <p className="font-medium">
                          {formData.stockType === 'unlimited'
                            ? 'Always available (until marked out of stock)'
                            : `${formData.quantity || '1'} in stock`}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Starting Price:</span>
                        <p className="font-medium">R{parseFloat(formData.startingPrice || '0').toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Duration:</span>
                        <p className="font-medium">{formData.duration} days</p>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-600">Pickup Location:</span>
                  <p className="font-medium">{formData.pickupAddress}</p>
                  <p className="text-sm text-gray-600">
                    {formData.pickupCity}, {formData.pickupProvince}, {formData.pickupPostalCode}
                  </p>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-600">Shipping:</span>
                  <p className="font-medium">
                    {formData.freeShipping
                      ? 'Free shipping'
                      : `R${parseFloat(formData.shippingCost || '0').toLocaleString()}`
                    }
                  </p>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-600">Images:</span>
                  <p className="font-medium">{formData.images.length} image(s) uploaded</p>
                </div>

                {formData.featured && (
                  <div className="flex items-center space-x-2 text-primary-600">
                    <CheckCircleIcon className="h-5 w-5" />
                    <span className="font-medium">Featured auction</span>
                  </div>
                )}

                {formData.isLiveAuction && (
                  <div className="flex items-center space-x-2 text-orange-600">
                    <CheckCircleIcon className="h-5 w-5" />
                    <span className="font-medium">Live Auction - R{formData.registrationFee} registration fee</span>
                  </div>
                )}

                {formData.scheduleForLater && formData.scheduledStartTime && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <CalendarIcon className="h-5 w-5" />
                    <span className="font-medium">
                      Scheduled for{' '}
                      {new Date(formData.scheduledStartTime).toLocaleDateString('en-ZA', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}{' '}
                      at{' '}
                      {new Date(formData.scheduledStartTime).toLocaleTimeString('en-ZA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Review Before Submitting</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    Please review all information carefully. Once the auction is live, some details cannot be changed.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  if (user?.role !== 'admin' && user?.role !== 'seller') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">Seller privileges required to create auctions.</p>
      </motion.div>
    )
  }

  // Step 0: choose what kind of listing this is before showing the wizard.
  if (!formData.listingType) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-3xl mx-auto space-y-6"
      >
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Create a New Listing</h1>
          <p className="text-gray-600 mt-2">What kind of listing is this?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, listingType: 'auction' }))}
            className="text-left bg-white rounded-xl shadow-sm border-2 border-gray-200 hover:border-primary-500 p-6 transition-colors"
          >
            <ClockIcon className="h-10 w-10 text-primary-600 mb-3" />
            <h2 className="text-xl font-semibold text-gray-900">Auction</h2>
            <p className="text-gray-600 mt-2 text-sm">
              Buyers place bids over a set time period. Set a starting price and bid increment.
              Optionally add a Buy Now price, schedule it, or make it a live auction.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, listingType: 'sale' }))}
            className="text-left bg-white rounded-xl shadow-sm border-2 border-gray-200 hover:border-primary-500 p-6 transition-colors"
          >
            <TagIcon className="h-10 w-10 text-green-600 mb-3" />
            <h2 className="text-xl font-semibold text-gray-900">For Sale (Fixed Price)</h2>
            <p className="text-gray-600 mt-2 text-sm">
              A normal product sold at a fixed price — no bidding. Set a price and how many units
              are in stock. Buyers purchase instantly until it sells out.
            </p>
          </button>
        </div>
      </motion.div>
    )
  }

  const isSaleListing = formData.listingType === 'sale'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center">
              <PlusIcon className="h-8 w-8 text-green-600 mr-3" />
              {isSaleListing ? 'Create New Product (For Sale)' : 'Create New Auction'}
            </h1>
            <p className="text-gray-600 mt-2">
              {isSaleListing
                ? 'List a fixed-price product for buyers to purchase instantly'
                : 'Create and list a new auction item for bidders to discover'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setFormData(prev => ({ ...prev, listingType: '' })); setCurrentStep(1) }}
            className="text-sm text-primary-600 hover:underline whitespace-nowrap mt-2"
          >
            Change type
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                currentStep >= step.id 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {currentStep > step.id ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>
              <div className="ml-3 hidden md:block">
                <p className={`text-sm font-medium ${
                  currentStep >= step.id ? 'text-primary-600' : 'text-gray-500'
                }`}>
                  {step.title}
                </p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden md:block w-16 h-px bg-gray-200 ml-6" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm border">
        <form onSubmit={handleSubmit} className="p-6">
          {renderStep()}

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="btn-outline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <div className="flex space-x-3">
              {currentStep < steps.length ? (
                <button
                  key="next-button"
                  type="button"
                  onClick={nextStep}
                  className="btn-primary"
                >
                  Next
                </button>
              ) : (
                <button
                  key="submit-button"
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <ClockIcon className="h-4 w-4 mr-2 animate-spin" />
                      {formData.scheduleForLater ? 'Scheduling Auction...' : 'Creating Auction...'}
                    </>
                  ) : (
                    formData.scheduleForLater ? 'Schedule Auction' : 'Create Auction'
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  )
}

export default CreateAuction