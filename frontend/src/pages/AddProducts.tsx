import React, { useState } from 'react';
import { addSampleProducts } from '../scripts/addSampleProducts';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const AddProducts: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Allow sellers and admins
  if (!user || (user.role !== 'admin' && user.role !== 'seller')) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-red-800 font-semibold mb-2">Access Denied</h2>
          <p className="text-red-600">Seller privileges required to add sample products.</p>
        </div>
      </div>
    );
  }

  const handleAddProducts = async () => {
    setLoading(true);
    try {
      const result = await addSampleProducts();
      toast.success(`Successfully added ${result.successCount} products!`);
      setTimeout(() => {
        navigate('/products');
      }, 2000);
    } catch (error: any) {
      toast.error('Failed to add products: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Add Sample Products</h1>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800">
            This will add 12 sample products across different categories with active auctions.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <h2 className="font-semibold text-lg">Products to be added:</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Electronics: iPhone 15 Pro Max, MacBook Air M2, Samsung Galaxy S24, PlayStation 5</li>
            <li>Fashion: Nike Air Jordan 1, Gucci GG Marmont Bag</li>
            <li>Home & Garden: Dyson V15 Vacuum, Herman Miller Aeron Chair</li>
            <li>Sports & Outdoors: Trek Road Bike, Garmin Fenix Watch</li>
            <li>Art & Collectibles: Banksy Print, Vintage Rolex</li>
          </ul>
        </div>

        <button
          onClick={handleAddProducts}
          disabled={loading}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Adding Products...
            </span>
          ) : (
            'Add Sample Products'
          )}
        </button>
      </div>
    </div>
  );
};

export default AddProducts;