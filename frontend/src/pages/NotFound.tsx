import { Link } from 'react-router-dom'

// Friendly 404 — shown for any unknown URL so users never see a blank page.
const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[60vh] px-4">
      <p className="text-6xl font-bold text-primary-600">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 text-gray-600 max-w-md">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <Link to="/" className="btn-primary">Go home</Link>
        <Link to="/products" className="btn-outline">Browse products</Link>
        <Link to="/help" className="btn-outline">Help Centre</Link>
      </div>
    </div>
  )
}

export default NotFound
