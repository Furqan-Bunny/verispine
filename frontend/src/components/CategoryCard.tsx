import { Link } from 'react-router-dom'
import { 
  ComputerDesktopIcon,
  HomeIcon,
  ShoppingBagIcon,
  TrophyIcon,
  BookOpenIcon,
  MusicalNoteIcon,
  CameraIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'

interface CategoryCardProps {
  category: any
}

const categoryIcons: { [key: string]: any } = {
  electronics: ComputerDesktopIcon,
  home: HomeIcon,
  fashion: ShoppingBagIcon,
  sports: TrophyIcon,
  books: BookOpenIcon,
  music: MusicalNoteIcon,
  photography: CameraIcon,
  default: SparklesIcon
}

const CategoryCard = ({ category }: CategoryCardProps) => {
  const Icon = categoryIcons[category.slug] || categoryIcons.default
  
  return (
    <Link
      to={`/products?category=${category._id}`}
      className="group"
    >
      <div className="card text-center hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <div className="w-16 h-16 mx-auto mb-3 bg-primary-100 rounded-full flex items-center justify-center group-hover:bg-primary-200 transition-colors">
          <Icon className="h-8 w-8 text-primary-600" />
        </div>
        <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
          {category.name}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          {category.productCount} items
        </p>
      </div>
    </Link>
  )
}

export default CategoryCard