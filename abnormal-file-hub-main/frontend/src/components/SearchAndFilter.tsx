import React, { useState, useCallback } from 'react';
import { FunnelIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import useDebounce from '../hooks/useDebounce';

export interface FilterParams {
  filename?: string;
  file_type?: string;
  min_size?: number;
  max_size?: number;
  upload_date_after?: string;
  upload_date_before?: string;
}

interface SearchAndFilterProps {
  onFilterChange: (filters: FilterParams) => void;
  isLoading?: boolean;
}

export const SearchAndFilter: React.FC<SearchAndFilterProps> = ({ onFilterChange, isLoading }) => {
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterParams>({});
  const debouncedFilters = useDebounce(localFilters, 300); // 300ms debounce

  // Memoize common file types
  const commonFileTypes = React.useMemo(() => [
    { value: '', label: 'All Types' },
    { value: 'image/jpeg', label: 'JPEG Image' },
    { value: 'image/png', label: 'PNG Image' },
    { value: 'application/pdf', label: 'PDF Document' },
    { value: 'text/plain', label: 'Text File' },
    { value: 'application/msword', label: 'Word Document' },
  ], []);

  // Update filters with debouncing
  React.useEffect(() => {
    onFilterChange(debouncedFilters);
  }, [debouncedFilters, onFilterChange]);

  const handleFilterChange = useCallback((key: keyof FilterParams, value: string | number | undefined) => {
    setLocalFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      if (!value) {
        delete newFilters[key];
      }
      return newFilters;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setLocalFilters({});
  }, []);

  const hasActiveFilters = Object.keys(localFilters).length > 0;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex items-center">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className={`h-5 w-5 ${isLoading ? 'text-primary-500 animate-pulse' : 'text-gray-400'}`} />
          </div>
          <input
            type="text"
            placeholder="Search files..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
            onChange={(e) => handleFilterChange('filename', e.target.value)}
            value={localFilters.filename || ''}
          />
        </div>
        <button
          type="button"
          className={`ml-3 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md ${
            showFilters ? 'text-primary-700 bg-primary-50' : 'text-gray-700 bg-white'
          } hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <FunnelIcon className="h-5 w-5 mr-2" />
          Filters
          {hasActiveFilters && (
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
              {Object.keys(localFilters).length}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button
            type="button"
            className="ml-2 inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            onClick={clearFilters}
          >
            <XMarkIcon className="h-5 w-5" />
            <span className="sr-only">Clear filters</span>
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white shadow rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* File Type Filter */}
            <div>
              <label htmlFor="file-type" className="block text-sm font-medium text-gray-700">
                File Type
              </label>
              <select
                id="file-type"
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                value={localFilters.file_type || ''}
                onChange={(e) => handleFilterChange('file_type', e.target.value)}
              >
                {commonFileTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            {/* Size Range Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Size Range (bytes)</label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  placeholder="Min"
                  className="block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                  value={localFilters.min_size || ''}
                  onChange={(e) => handleFilterChange('min_size', e.target.value ? parseInt(e.target.value) : undefined)}
                />
                <input
                  type="number"
                  placeholder="Max"
                  className="block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                  value={localFilters.max_size || ''}
                  onChange={(e) => handleFilterChange('max_size', e.target.value ? parseInt(e.target.value) : undefined)}
                />
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Upload Date Range</label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  className="block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                  value={localFilters.upload_date_after || ''}
                  onChange={(e) => handleFilterChange('upload_date_after', e.target.value)}
                />
                <input
                  type="date"
                  className="block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
                  value={localFilters.upload_date_before || ''}
                  onChange={(e) => handleFilterChange('upload_date_before', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchAndFilter; 