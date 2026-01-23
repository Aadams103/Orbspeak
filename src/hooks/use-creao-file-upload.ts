import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { postMainOfficialApiPresignS3Upload } from '@/sdk/api-clients/CreaoFileUpload';

export interface FileUploadInput {
  file: File;
  onProgress?: (progress: number) => void;
}

export interface FileUploadResponse {
  uploadedUrl: string;
  fileKey: string;
  success: boolean;
}

export interface FileUploadError extends Error {
  statusCode?: number;
  originalMessage?: string;
}

/**
 * Hook for uploading files to S3 via presigned URLs
 *
 * This hook handles the complete file upload process:
 * 1. Generates a presigned URL from the API
 * 2. Uploads the file directly to S3
 * 3. Returns the permanent URL where the file is accessible
 *
 * Supports audio files (WAV, WebM, MP3) and other file types.
 *
 * @example
 * ```tsx
 * const uploadMutation = useCreaoFileUploadMutation();
 *
 * const handleUpload = async (file: File) => {
 *   try {
 *     const result = await uploadMutation.mutateAsync({
 *       file,
 *       onProgress: (progress) => console.log(`${progress}%`)
 *     });
 *     console.log('File uploaded:', result.uploadedUrl);
 *   } catch (error) {
 *     console.error('Upload failed:', error);
 *   }
 * };
 * ```
 */
export function useCreaoFileUploadMutation(): UseMutationResult<
  FileUploadResponse,
  FileUploadError,
  FileUploadInput
> {
  return useMutation({
    mutationFn: async (input: FileUploadInput): Promise<FileUploadResponse> => {
      // Validate file input
      if (!input.file || !(input.file instanceof File)) {
        const error = new Error('Valid File object is required') as FileUploadError;
        throw error;
      }

      const { file, onProgress } = input;
      const fileName = file.name;
      const contentType = file.type || 'application/octet-stream';

      // Step 1: Get presigned URL from API
      const presignResponse = await postMainOfficialApiPresignS3Upload({
        body: {
          fileName,
          contentType,
        },
        headers: {
          'X-CREAO-API-NAME': 'CreaoFileUpload',
          'X-CREAO-API-PATH': '/main/official-api/presign-s3-upload',
          'X-CREAO-API-ID': '68b68b97ac476c8df7efbeaf',
        },
      });

      // Handle API errors
      if (presignResponse.error) {
        const error = new Error(
          presignResponse.error.message || 'Failed to generate presigned URL'
        ) as FileUploadError;
        error.statusCode = presignResponse.response.status;
        error.originalMessage = presignResponse.error.message;
        throw error;
      }

      // Validate presigned URL response
      if (!presignResponse.data?.presignedUrl) {
        const error = new Error('No presigned URL returned from server') as FileUploadError;
        throw error;
      }

      if (!presignResponse.data.realFileUrl) {
        const error = new Error('No real file URL returned from server') as FileUploadError;
        throw error;
      }

      const { presignedUrl, realFileUrl, fileKey } = presignResponse.data;

      // Step 2: Upload file directly to S3 using presigned URL
      try {
        const xhr = new XMLHttpRequest();

        const uploadPromise = new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
              const progress = Math.round((event.loaded / event.total) * 100);
              onProgress(progress);
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(
                new Error(
                  `S3 upload failed with status ${xhr.status}: ${xhr.statusText}`
                )
              );
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during file upload'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('File upload was aborted'));
          });

          xhr.open('PUT', presignedUrl);
          xhr.setRequestHeader('Content-Type', contentType);
          xhr.send(file);
        });

        await uploadPromise;

        return {
          uploadedUrl: realFileUrl,
          fileKey: fileKey || '',
          success: true,
        };
      } catch (uploadError) {
        const error = new Error(
          `Failed to upload file to S3: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
        ) as FileUploadError;
        throw error;
      }
    },
  });
}
