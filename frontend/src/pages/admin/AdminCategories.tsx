import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import axios from '../../config/axios'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  TagIcon,
  FolderIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { useAdminSelection } from '../../hooks/useAdminSelection'
import { usePagination } from '../../hooks/usePagination'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import BulkDeleteBar from '../../components/admin/BulkDeleteBar'
import PaginationBar from '../../components/admin/PaginationBar'
import { adminBulkDelete } from '../../services/adminDelete'

interface Category {
  id: string
  name: string
  slug?: string
  icon?: string
  description?: string
  order?: number
  productCount?: number
  createdAt?: any
  updatedAt?: any
}

// Lowercase, hyphenated, alphanumeric-only slug (kept in sync with backend slugifyCategory)
const slugify = (value: string) =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// Curated set of category-relevant emojis for the picker
const EMOJI_OPTIONS = [
  '📦', '📱', '💻', '⌚', '🎧', '📷', '🔌', '🎮', '🕹️', '📺',
  '👗', '👕', '👟', '👜', '💍', '💄', '🧴', '🕶️', '🎩', '⌚',
  '🏠', '🛋️', '🪑', '🛏️', '🍳', '🧹', '🌿', '🪴', '🛠️', '🔧',
  '🚗', '🏍️', '🚲', '⚽', '🏀', '🎾', '🏋️', '🚴', '🎯', '🎲',
  '📚', '🎨', '🎸', '🎹', '🏺', '🎁', '🐾', '🍔', '🧸', '💎'
]

const EmojiPicker = ({ value, onChange }: { value: string; onChange: (emoji: string) => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="h-11 w-11 flex items-center justify-center text-2xl border border-gray-300 rounded-lg hover:bg-gray-50"
          title="Choose an emoji"
        >
          {value || '📦'}
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-field flex-1"
          placeholder="Pick or type an emoji"
          maxLength={4}
        />
      </div>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-2 w-72 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1">
            {EMOJI_OPTIONS.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                onClick={() => { onChange(emoji); setOpen(false) }}
                className={`h-8 w-8 flex items-center justify-center text-xl rounded hover:bg-primary-50 ${
                  value === emoji ? 'bg-primary-100 ring-1 ring-primary-400' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const AdminCategories = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [editSlugTouched, setEditSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCategory, setNewCategory] = useState({
    name: '',
    slug: '',
    icon: '',
    description: '',
    order: 0
  })
  // Track whether the user manually edited the slug, so name-typing stops auto-filling it
  const [slugTouched, setSlugTouched] = useState(false)
  const sel = useAdminSelection()
  const [bulkOpen, setBulkOpen] = useState(false)
  const [rowToDelete, setRowToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      toast.error('Admin access required')
      navigate('/')
      return
    }
    fetchCategories()
  }, [user])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/admin/categories')
      if (response.data.success) {
        const categoriesWithCount = await Promise.all(
          response.data.data.map(async (cat: Category) => {
            try {
              // NOTE: the products endpoint expects the query param `category` (not
              // `categoryId`); `status=all` so the count reflects every product, not just active.
              const prodResponse = await axios.get(`/api/products?category=${cat.id}&status=all`)
              return { ...cat, productCount: prodResponse.data.data?.length || 0 }
            } catch (error) {
              return { ...cat, productCount: 0 }
            }
          })
        )
        setCategories(categoriesWithCount)
      }
    } catch (error: any) {
      console.error('Error fetching categories:', error)
      toast.error('Failed to fetch categories')
    } finally {
      setLoading(false)
    }
  }

  // Name change: auto-suggest slug unless the user has manually edited it
  const handleNewNameChange = (name: string) => {
    setNewCategory(prev => ({
      ...prev,
      name,
      slug: slugTouched ? prev.slug : slugify(name)
    }))
  }

  const openAddModal = () => {
    setNewCategory({ name: '', slug: '', icon: '', description: '', order: 0 })
    setSlugTouched(false)
    setShowAddModal(true)
  }

  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) {
      toast.error('Category name is required')
      return
    }

    try {
      setSaving(true)
      const payload = { ...newCategory, slug: newCategory.slug || slugify(newCategory.name) }
      const response = await axios.post('/api/admin/categories', payload)
      if (response.data.success) {
        toast.success('Category added successfully')
        setShowAddModal(false)
        setNewCategory({ name: '', slug: '', icon: '', description: '', order: 0 })
        setSlugTouched(false)
        fetchCategories()
      }
    } catch (error: any) {
      console.error('Error adding category:', error)
      toast.error(error.response?.data?.error || 'Failed to add category')
    } finally {
      setSaving(false)
    }
  }

  const handleEditCategory = (category: any) => {
    setEditingCategory({ ...category, slug: category.slug || slugify(category.name) })
    setEditSlugTouched(false)
    setShowEditModal(true)
  }

  const handleEditNameChange = (name: string) => {
    setEditingCategory((prev: any) => ({
      ...prev,
      name,
      slug: editSlugTouched ? prev.slug : slugify(name)
    }))
  }

  const handleUpdateCategory = async () => {
    if (!editingCategory?.name?.trim()) {
      toast.error('Category name is required')
      return
    }

    try {
      setSaving(true)
      const response = await axios.put(`/api/admin/categories/${editingCategory.id}`, {
        name: editingCategory.name,
        slug: editingCategory.slug || slugify(editingCategory.name),
        icon: editingCategory.icon,
        description: editingCategory.description,
        order: editingCategory.order || 0
      })
      if (response.data.success) {
        toast.success('Category updated successfully')
        setShowEditModal(false)
        setEditingCategory(null)
        fetchCategories()
      }
    } catch (error: any) {
      console.error('Error updating category:', error)
      toast.error(error.response?.data?.error || 'Failed to update category')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async (ids: string[]) => {
    if (!ids.length) return
    setDeleting(true)
    try {
      const res = await adminBulkDelete('categories', ids)
      setCategories(prev => prev.filter(c => !ids.includes(c.id)))
      if (res.failed?.length) toast.error(`${res.failed.length} could not be deleted: ${res.failed[0].reason}`)
      else toast.success(`Deleted ${res.deleted}`)
      sel.clear(); setRowToDelete(null); setBulkOpen(false)
      fetchCategories()
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const filteredCategories = categories.filter(category => {
    const q = searchQuery.toLowerCase()
    return (
      category.name?.toLowerCase().includes(q) ||
      (category.slug || slugify(category.name)).toLowerCase().includes(q) ||
      (category.description || '').toLowerCase().includes(q)
    )
  })

  const { paginatedItems, currentPage, totalPages, totalItems, startIndex, endIndex, setCurrentPage } = usePagination({
    data: filteredCategories,
    itemsPerPage: 20,
    resetPageOn: [searchQuery]
  })

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const stats = {
    totalCategories: categories.length,
    activeCategories: categories.length,
    totalProducts: categories.reduce((sum, cat) => sum + (cat.productCount || 0), 0),
    inactiveCategories: 0
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Categories</p>
              <p className="text-2xl font-bold text-blue-900">{stats.totalCategories}</p>
              <p className="text-xs text-blue-600 mt-1">All categories</p>
            </div>
            <FolderIcon className="h-10 w-10 text-blue-500" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-green-50 to-green-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Active Categories</p>
              <p className="text-2xl font-bold text-green-900">{stats.activeCategories}</p>
              <p className="text-xs text-green-600 mt-1">Currently enabled</p>
            </div>
            <CheckCircleIcon className="h-10 w-10 text-green-500" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-purple-50 to-purple-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Products</p>
              <p className="text-2xl font-bold text-purple-900">{stats.totalProducts}</p>
              <p className="text-xs text-purple-600 mt-1">Across all categories</p>
            </div>
            <TagIcon className="h-10 w-10 text-purple-500" />
          </div>
        </div>

        <div className="card bg-gradient-to-br from-red-50 to-red-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Inactive</p>
              <p className="text-2xl font-bold text-red-900">{stats.inactiveCategories}</p>
              <p className="text-xs text-red-600 mt-1">Disabled categories</p>
            </div>
            <XCircleIcon className="h-10 w-10 text-red-500" />
          </div>
        </div>
      </div>

      {/* Search + Add */}
      <div className="card">
        <div className="flex flex-wrap gap-4 justify-between items-center">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search categories..."
              className="input-field pl-10"
            />
          </div>

          <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
            <PlusIcon className="h-4 w-4" />
            Add Category
          </button>
        </div>
      </div>

      {/* Categories Table */}
      <BulkDeleteBar
        count={sel.selected.length}
        label="category"
        onClear={sel.clear}
        onDelete={() => setBulkOpen(true)}
      />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={sel.allSelected(paginatedItems.map(c => c.id))}
                    onChange={() => sel.toggleAll(paginatedItems.map(c => c.id))}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Identifier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Updated</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    {categories.length === 0 ? 'No categories yet. Click "Add Category" to create one.' : 'No categories match your search.'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={sel.isSelected(category.id)}
                        onChange={() => sel.toggle(category.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{category.icon || '📦'}</span>
                        <div>
                          <p className="font-medium text-gray-900">{category.name}</p>
                          <p className="text-sm text-gray-600 line-clamp-1">{category.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {category.slug || slugify(category.name)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{category.productCount || 0}</p>
                        <p className="text-xs text-gray-500">total products</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircleIcon className="h-3 w-3" />
                        active
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-600">
                        <p>{category.updatedAt ? new Date(category.updatedAt._seconds ? category.updatedAt._seconds * 1000 : category.updatedAt).toLocaleDateString() : 'N/A'}</p>
                        <p className="text-xs text-gray-500">Order: {category.order || 0}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditCategory(category)}
                          className="p-1 text-gray-600 hover:text-primary-600"
                          title="Edit Category"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setRowToDelete(category.id)}
                          className="p-1 text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={category.productCount ? 'Cannot delete a category with products' : 'Delete Category'}
                          disabled={!!category.productCount && category.productCount > 0}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          total={totalItems}
          start={startIndex}
          end={endIndex}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          label="category"
        />
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Add New Category</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Name</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => handleNewNameChange(e.target.value)}
                  className="input-field"
                  placeholder="e.g., Home & Garden"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Slug</label>
                <input
                  type="text"
                  value={newCategory.slug}
                  onChange={(e) => { setSlugTouched(true); setNewCategory({ ...newCategory, slug: e.target.value }) }}
                  className="input-field font-mono text-sm"
                  placeholder="auto-generated from name"
                />
                <p className="text-xs text-gray-500 mt-1">Suggested from the name. You can edit it.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                  className="input-field"
                  placeholder="Brief description of the category..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon (Emoji)</label>
                <EmojiPicker value={newCategory.icon} onChange={(emoji) => setNewCategory({ ...newCategory, icon: emoji })} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={newCategory.order}
                  onChange={(e) => setNewCategory({ ...newCategory, order: parseInt(e.target.value) || 0 })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleAddCategory} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Adding...' : 'Add Category'}
              </button>
              <button onClick={() => setShowAddModal(false)} className="btn-outline flex-1">
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Category Modal */}
      {showEditModal && editingCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Category</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Name</label>
                <input
                  type="text"
                  value={editingCategory.name || ''}
                  onChange={(e) => handleEditNameChange(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category Slug</label>
                <input
                  type="text"
                  value={editingCategory.slug || ''}
                  onChange={(e) => { setEditSlugTouched(true); setEditingCategory({ ...editingCategory, slug: e.target.value }) }}
                  className="input-field font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingCategory.description || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon (Emoji)</label>
                <EmojiPicker value={editingCategory.icon || ''} onChange={(emoji) => setEditingCategory({ ...editingCategory, icon: emoji })} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <input
                  type="number"
                  value={editingCategory.order || 0}
                  onChange={(e) => setEditingCategory({ ...editingCategory, order: parseInt(e.target.value) || 0 })}
                  className="input-field"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Products in category:</span> {editingCategory.productCount || 0}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleUpdateCategory} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Saving...' : 'Update Category'}
              </button>
              <button
                onClick={() => { setShowEditModal(false); setEditingCategory(null) }}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={!!rowToDelete}
        title="Delete category?"
        message="This permanently deletes the category. This action cannot be undone."
        loading={deleting}
        onConfirm={() => doDelete([rowToDelete!])}
        onCancel={() => setRowToDelete(null)}
      />
      <ConfirmDialog
        open={bulkOpen}
        title={`Delete ${sel.selected.length} categor${sel.selected.length > 1 ? 'ies' : 'y'}?`}
        message="This permanently deletes the selected categories. This action cannot be undone."
        requireText="DELETE"
        loading={deleting}
        onConfirm={() => doDelete(sel.selected)}
        onCancel={() => setBulkOpen(false)}
      />
    </motion.div>
  )
}

export default AdminCategories
