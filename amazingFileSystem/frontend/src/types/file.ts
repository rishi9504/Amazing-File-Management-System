export interface File {
  id: string;
  original_filename: string;
  file_type: string;
  size: number;
  uploaded_at: string;
  file: string;
  reference_count: number;
  storage_saved: number;
  storage_saved_formatted: string;
}

export interface FileReference {
  id: string;
  reference_name: string;
  created_at: string;
  original_file: File;
}

export interface FileUploadResponse {
  message: string;
  type: 'original' | 'reference';
  file?: File;
  reference?: FileReference;
} 