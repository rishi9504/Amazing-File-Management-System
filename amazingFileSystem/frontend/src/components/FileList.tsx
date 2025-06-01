import React, { useState, useRef, useCallback } from 'react';
import { fileService } from '../services/fileService';
import { File as FileType, FileReference } from '../types/file';
import { DocumentIcon, TrashIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StorageSavings from './StorageSavings';
import SearchAndFilter, { FilterParams } from './SearchAndFilter';

export const FileList: React.FC = () => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<FilterParams>({});
  const [references, setReferences] = useState<Record<string, FileReference[]>>({});
  const [loadingRefs, setLoadingRefs] = useState<Record<string, boolean>>({});
  const [deletingRefs, setDeletingRefs] = useState<Record<string, boolean>>({});
  const lastDeletedRefFileId = useRef<string | null>(null);
  const [lastFileId, setLastFileId] = useState<string | null>(null);

  // Query for fetching files with filters
  const { data: files = [], isLoading, error, refetch } = useQuery({
    queryKey: ['files', filters],
    queryFn: () => fileService.getFiles(filters),
    staleTime: 1000, // 1 second stale time to prevent too frequent refetches
    refetchOnMount: 'always',
    refetchOnWindowFocus: false, // Disable window focus refetch
  });

  // Query for fetching references
  const fetchReferences = useCallback(async (fileId: string) => {
    if (loadingRefs[fileId]) return; // Prevent concurrent fetches for the same file
    
    try {
      setLoadingRefs((prev) => ({ ...prev, [fileId]: true }));
      const refs = await fileService.getReferences(fileId);
      setReferences((prev) => ({ ...prev, [fileId]: refs }));
    } catch (error) {
      console.error('Error fetching references:', error);
    } finally {
      setLoadingRefs((prev) => ({ ...prev, [fileId]: false }));
    }
  }, []);

  // Effect to fetch references when files change
  React.useEffect(() => {
    const fetchAllReferences = async () => {
      if (!files?.length) return;

      // Get files that need reference fetching
      const filesToFetch = files.filter(file => 
        file.reference_count > 0 && !loadingRefs[file.id] && !references[file.id]
      );
      
      // Clear references for files that have no references
      setReferences(prev => {
        const newRefs = { ...prev };
        files.forEach(file => {
          if (file.reference_count === 0) {
            delete newRefs[file.id];
          }
        });
        return newRefs;
      });

      // Fetch references for files that need them
      for (const file of filesToFetch) {
        await fetchReferences(file.id);
      }
    };

    fetchAllReferences();
  }, [files, fetchReferences, loadingRefs, references]);

  // Function to handle reference deletion
  const handleReferenceDelete = async (fileId: string, refId: string) => {
    if (deletingRefs[refId]) return; // Prevent concurrent deletions
    
    try {
      setDeletingRefs(prev => ({ ...prev, [refId]: true }));
      await refDeleteMutation.mutateAsync(refId);
      
      // Update local state
      setReferences(prev => ({
        ...prev,
        [fileId]: prev[fileId]?.filter(ref => ref.id !== refId) || []
      }));

      // Invalidate only the necessary queries
      await queryClient.invalidateQueries({ 
        queryKey: ['files'],
        refetchType: 'active'
      });
    } catch (error) {
      console.error('Error deleting reference:', error);
    } finally {
      setDeletingRefs(prev => ({ ...prev, [refId]: false }));
    }
  };

  // Reference deletion mutation
  const refDeleteMutation = useMutation({
    mutationFn: fileService.deleteReference,
    onError: (error) => {
      console.error('Error deleting reference:', error);
      alert('Failed to delete reference. Please try again.');
    }
  });

  // Calculate storage statistics
  const storageStats = React.useMemo(() => {
    const fileArray = files as FileType[];
    if (!fileArray || fileArray.length === 0) {
      return {
        totalFiles: 0,
        totalSize: 0,
        totalSaved: 0,
        formattedSaved: '0 B',
        savingsPercentage: 0
      };
    }

    const totalFiles = fileArray.length;
    const totalSize = fileArray.reduce((acc: number, file: FileType) => acc + file.size, 0);
    const totalSaved = fileArray.reduce((acc: number, file: FileType) => acc + (file.storage_saved || 0), 0);
    
    // Calculate savings percentage
    const savingsPercentage = totalSize > 0 ? (totalSaved / totalSize) * 100 : 0;
    
    // Format the total saved storage
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    return {
      totalFiles,
      totalSize,
      totalSaved,
      formattedSaved: formatBytes(totalSaved),
      savingsPercentage: parseFloat(savingsPercentage.toFixed(2))
    };
  }, [files]);

  // Mutation for deleting files
  const deleteMutation = useMutation({
    mutationFn: fileService.deleteFile,
    onSuccess: async () => {
      // Clear the cache completely
      queryClient.removeQueries({ queryKey: ['files'] });
      // Force an immediate refetch
      await refetch();
    },
  });

  // Mutation for downloading files
  const downloadMutation = useMutation({
    mutationFn: ({ fileUrl, filename }: { fileUrl: string; filename: string }) =>
      fileService.downloadFile(fileUrl, filename),
  });

  const handleDelete = async (id: string) => {
    try {
      console.log('Attempting to delete file with ID:', id);
      await deleteMutation.mutateAsync(id);
      console.log('File deleted successfully');
      
      // Clear references for the deleted file
      setReferences(prev => {
        const newRefs = { ...prev };
        delete newRefs[id];
        return newRefs;
      });
      
      // Force an immediate refetch
      await refetch();
    } catch (err: any) {
      console.error('Delete error:', err);
      
      // Always refetch to ensure UI is in sync with backend
      await refetch();
      
      // Show appropriate error message
      const errorMessage = err.response?.data?.detail || 
                         err.response?.data?.message || 
                         err.message || 
                         'An error occurred while deleting the file';
      
      alert(errorMessage);
    }
  };

  const handleDownload = async (fileUrl: string, filename: string) => {
    try {
      await downloadMutation.mutateAsync({ fileUrl, filename });
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <SearchAndFilter onFilterChange={setFilters} />
        <div className="mt-6 animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-3">
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <SearchAndFilter onFilterChange={setFilters} />
        <div className="mt-6 bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">Failed to load files. Please try again.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <SearchAndFilter onFilterChange={setFilters} />
      {!files || files.length === 0 ? (
        <div className="text-center py-12">
          <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No files found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {Object.keys(filters).length > 0
              ? 'Try adjusting your filters'
              : 'Get started by uploading a file'}
          </p>
        </div>
      ) : (
        <>
          <StorageSavings {...storageStats} />
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Uploaded Files
            {files.length > 0 && <span className="text-sm font-normal text-gray-500 ml-2">({files.length} files)</span>}
          </h2>
          <div className="mt-6 flow-root">
            <ul className="-my-5 divide-y divide-gray-200">
              {files.map((file) => (
                <li key={file.id} className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <DocumentIcon className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.original_filename}
                      </p>
                      <p className="text-sm text-gray-500">
                        {file.file_type} • {(file.size / 1024).toFixed(2)} KB
                        {file.reference_count > 1 && ` • ${file.reference_count} references`}
                        {file.storage_saved > 0 && ` • Saving ${file.storage_saved_formatted}`}
                      </p>
                      <p className="text-sm text-gray-500">
                        Uploaded {new Date(file.uploaded_at).toLocaleString()}
                      </p>
                      {/* References section */}
                      {loadingRefs[file.id] ? (
                        <div className="mt-2 text-sm text-gray-500">Loading references...</div>
                      ) : references[file.id] && references[file.id].length > 0 ? (
                        <div className="mt-2 ml-2">
                          <div className="text-xs text-gray-600 font-semibold mb-1">References:</div>
                          <ul className="ml-2">
                            {references[file.id].map((ref) => (
                              <li key={ref.id} className="flex items-center space-x-2 text-xs text-gray-700">
                                <span>{ref.reference_name}</span>
                                <span className="text-gray-400">({new Date(ref.created_at).toLocaleString()})</span>
                                <button
                                  onClick={() => handleReferenceDelete(file.id, ref.id)}
                                  disabled={deletingRefs[ref.id] || refDeleteMutation.isPending}
                                  className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                                >
                                  {deletingRefs[ref.id] ? 'Deleting...' : 'Delete Reference'}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleDownload(file.file, file.original_filename)}
                        disabled={downloadMutation.isPending}
                        className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                        Download
                      </button>
                      <button
                        onClick={() => handleDelete(file.id)}
                        disabled={deleteMutation.isPending}
                        className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <TrashIcon className="h-4 w-4 mr-1" />
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}; 