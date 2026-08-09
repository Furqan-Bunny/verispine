import { useState, Fragment } from 'react'
import { Combobox, Transition } from '@headlessui/react'
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline'
import { SUPPORTED_CITIES } from '../config/cities'

interface CitySelectProps {
  value: string
  onChange: (city: string) => void
  hasError?: boolean
  placeholder?: string
  id?: string
}

// Searchable city picker (type to filter the supported-cities list).
const CitySelect = ({ value, onChange, hasError, placeholder = 'Search for a city...', id }: CitySelectProps) => {
  const [query, setQuery] = useState('')

  const filtered =
    query === ''
      ? SUPPORTED_CITIES
      : SUPPORTED_CITIES.filter(c => c.toLowerCase().includes(query.toLowerCase().trim()))

  return (
    <Combobox value={value} onChange={onChange}>
      <div className="relative">
        <div className="relative w-full">
          <Combobox.Input
            id={id}
            autoComplete="off"
            className={`w-full px-4 py-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
              hasError ? 'border-red-300' : 'border-gray-300'
            }`}
            displayValue={(c: string) => c}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-3">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </Combobox.Button>
        </div>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          afterLeave={() => setQuery('')}
        >
          <Combobox.Options className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {filtered.length === 0 ? (
              <div className="px-4 py-2 text-sm text-gray-500">No matching city</div>
            ) : (
              filtered.map(city => (
                <Combobox.Option
                  key={city}
                  value={city}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-9 pr-4 ${
                      active ? 'bg-primary-50 text-primary-700' : 'text-gray-900'
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                        {city}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-primary-600">
                          <CheckIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  )
}

export default CitySelect
