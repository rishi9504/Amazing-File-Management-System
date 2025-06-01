import axios from 'axios';
import { File, FileReference, FileUploadResponse } from '../types/file';
import { FilterParams } from '../components/SearchAndFilter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const fileService = {
  async getFiles(filters?: FilterParams): Promise<File[]> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.append(key, value.toString());
        }
      });
    }

    // Add timestamp to prevent browser caching
    params.append('_t', Date.now().toString());

    const response = await axios.get<PaginatedResponse<File>>(`${API_URL}/files/`, { params });
    return response.data.results;
  },

  async uploadFile(file: Blob): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post<FileUploadResponse>(`${API_URL}/files/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async deleteFile(id: string): Promise<void> {
    console.log('Deleting file at URL:', `${API_URL}/files/${id}/`);
    try {
      await axios.delete(`${API_URL}/files/${id}/`);
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.error('File not found or already deleted');
        throw new Error('File not found or already deleted');
      }
      console.error('Delete request failed:', error.response?.data || error.message);
      throw error;
    }
  },

  async downloadFile(fileUrl: string, filename: string): Promise<void> {
    const response = await axios.get(fileUrl, {
      responseType: 'blob',
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async getReferences(fileId: string): Promise<FileReference[]> {
    const response = await axios.get<{ results: FileReference[] }>(`${API_URL}/references/`, {
      params: { original_file: fileId }
    });
    return response.data.results;
  },

  async deleteReference(referenceId: string): Promise<void> {
    await axios.delete(`${API_URL}/references/${referenceId}/`);
  },
}; 