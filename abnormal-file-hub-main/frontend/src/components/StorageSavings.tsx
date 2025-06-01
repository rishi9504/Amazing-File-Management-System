import React from 'react';

interface StorageSavingsProps {
  totalFiles: number;
  totalSize: number;
  totalSaved: number;
  formattedSaved: string;
  savingsPercentage: number;
}

const StorageSavings: React.FC<StorageSavingsProps> = ({
  totalFiles,
  totalSize,
  totalSaved,
  formattedSaved,
  savingsPercentage
}) => {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Storage Statistics</h3>
      <div className="bg-white rounded-lg shadow px-5 py-6 sm:px-6">
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Files</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{totalFiles}</dd>
          </div>

          <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Storage Saved</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{formattedSaved}</dd>
            {savingsPercentage > 0 && (
              <p className="mt-1 text-sm text-green-600">
                {savingsPercentage}% saved
              </p>
            )}
          </div>

          <div className="px-4 py-5 bg-gray-50 shadow rounded-lg overflow-hidden sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Storage Efficiency</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {savingsPercentage > 0 ? (
                <span className="text-green-600">{savingsPercentage}%</span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </dd>
            {totalSaved > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Using {((totalSize - totalSaved) / totalSize * 100).toFixed(1)}% of original space
              </p>
            )}
          </div>
        </dl>
      </div>
    </div>
  );
};

export default StorageSavings; 