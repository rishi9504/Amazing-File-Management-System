from django.shortcuts import render
from rest_framework import viewsets, status, filters, mixins
from rest_framework.response import Response
from django_filters import rest_framework as django_filters
from .models import File, FileReference, calculate_file_hash
from .serializers import FileSerializer, FileReferenceSerializer
from django.core.files.base import ContentFile
from django.db.models import Q, F
from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.conf import settings
from datetime import datetime, timedelta
from django.db import transaction, IntegrityError
from drf_yasg.utils import swagger_auto_schema, swagger_serializer_method
from drf_yasg import openapi
import io

# Create response schemas for Swagger
file_upload_response = openapi.Schema(
    type=openapi.TYPE_OBJECT,
    properties={
        'message': openapi.Schema(type=openapi.TYPE_STRING),
        'type': openapi.Schema(type=openapi.TYPE_STRING, enum=['original', 'reference']),
        'file': openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'id': openapi.Schema(type=openapi.TYPE_STRING),
                'file': openapi.Schema(type=openapi.TYPE_STRING),
                'original_filename': openapi.Schema(type=openapi.TYPE_STRING),
                'file_type': openapi.Schema(type=openapi.TYPE_STRING),
                'size': openapi.Schema(type=openapi.TYPE_INTEGER),
                'uploaded_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
                'reference_count': openapi.Schema(type=openapi.TYPE_INTEGER),
                'storage_saved': openapi.Schema(type=openapi.TYPE_INTEGER),
                'storage_saved_formatted': openapi.Schema(type=openapi.TYPE_STRING),
            }
        ),
        'reference': openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'id': openapi.Schema(type=openapi.TYPE_STRING),
                'reference_name': openapi.Schema(type=openapi.TYPE_STRING),
                'created_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
                'original_file': openapi.Schema(type=openapi.TYPE_STRING),
            }
        ),
    }
)

class FileFilter(django_filters.FilterSet):
    filename = django_filters.CharFilter(field_name='original_filename', lookup_expr='icontains')
    min_size = django_filters.NumberFilter(field_name='size', lookup_expr='gte')
    max_size = django_filters.NumberFilter(field_name='size', lookup_expr='lte')
    file_type = django_filters.CharFilter(field_name='file_type', lookup_expr='iexact')
    upload_date_after = django_filters.DateFilter(field_name='uploaded_at', lookup_expr='date__gte')
    upload_date_before = django_filters.DateFilter(field_name='uploaded_at', lookup_expr='date__lte')

    class Meta:
        model = File
        fields = ['filename', 'file_type', 'min_size', 'max_size', 'upload_date_after', 'upload_date_before']

class FileViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing files.
    """
    queryset = File.objects.all().select_related()
    serializer_class = FileSerializer
    filter_backends = [django_filters.DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_class = FileFilter
    search_fields = ['original_filename', 'file_type']
    ordering_fields = ['original_filename', 'size', 'uploaded_at']
    ordering = ['-uploaded_at']

    def _invalidate_cache(self):
        """Helper method to invalidate cache"""
        cache.clear()  # Simply clear all cache instead of pattern matching

    def get_queryset(self):
        """
        Optimize queryset based on filter parameters
        """
        # Don't use cache for the queryset to ensure fresh data
        queryset = super().get_queryset()
        
        # Get filter parameters
        filename = self.request.query_params.get('filename')
        file_type = self.request.query_params.get('file_type')
        min_size = self.request.query_params.get('min_size')
        max_size = self.request.query_params.get('max_size')
        
        # Apply optimized filtering
        if filename:
            queryset = queryset.filter(original_filename__icontains=filename)
        if file_type:
            queryset = queryset.filter(file_type=file_type)
        if min_size:
            queryset = queryset.filter(size__gte=min_size)
        if max_size:
            queryset = queryset.filter(size__lte=max_size)
        
        return queryset

    @swagger_auto_schema(
        operation_description="List all files with optional filtering",
        manual_parameters=[
            openapi.Parameter('filename', openapi.IN_QUERY, description="Filter by filename (contains)", type=openapi.TYPE_STRING),
            openapi.Parameter('file_type', openapi.IN_QUERY, description="Filter by exact file type", type=openapi.TYPE_STRING),
            openapi.Parameter('min_size', openapi.IN_QUERY, description="Filter by minimum file size (bytes)", type=openapi.TYPE_INTEGER),
            openapi.Parameter('max_size', openapi.IN_QUERY, description="Filter by maximum file size (bytes)", type=openapi.TYPE_INTEGER),
            openapi.Parameter('upload_date_after', openapi.IN_QUERY, description="Filter by upload date after (YYYY-MM-DD)", type=openapi.TYPE_STRING),
            openapi.Parameter('upload_date_before', openapi.IN_QUERY, description="Filter by upload date before (YYYY-MM-DD)", type=openapi.TYPE_STRING),
        ],
        responses={
            200: openapi.Response(
                description="List of files",
                schema=openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        'count': openapi.Schema(type=openapi.TYPE_INTEGER),
                        'next': openapi.Schema(type=openapi.TYPE_STRING, nullable=True),
                        'previous': openapi.Schema(type=openapi.TYPE_STRING, nullable=True),
                        'results': openapi.Schema(
                            type=openapi.TYPE_ARRAY,
                            items=openapi.Schema(
                                type=openapi.TYPE_OBJECT,
                                properties={
                                    'id': openapi.Schema(type=openapi.TYPE_STRING),
                                    'file': openapi.Schema(type=openapi.TYPE_STRING),
                                    'original_filename': openapi.Schema(type=openapi.TYPE_STRING),
                                    'file_type': openapi.Schema(type=openapi.TYPE_STRING),
                                    'size': openapi.Schema(type=openapi.TYPE_INTEGER),
                                    'uploaded_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
                                    'reference_count': openapi.Schema(type=openapi.TYPE_INTEGER),
                                    'storage_saved': openapi.Schema(type=openapi.TYPE_INTEGER),
                                    'storage_saved_formatted': openapi.Schema(type=openapi.TYPE_STRING),
                                }
                            )
                        )
                    }
                )
            )
        }
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @swagger_auto_schema(
        operation_description="Upload a new file",
        request_body=openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'file': openapi.Schema(type=openapi.TYPE_FILE, description="File to upload"),
            },
            required=['file']
        ),
        responses={
            201: openapi.Response(description="File uploaded successfully", schema=file_upload_response),
            400: "Bad request",
            409: "Duplicate file"
        }
    )
    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Upload a new file. If the file content already exists, a reference will be created instead.
        """
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Calculate file hash
            content_hash = calculate_file_hash(file_obj)
            
            # Debug logging
            print(f"File upload attempt - Name: {file_obj.name}, Size: {file_obj.size}, Hash: {content_hash}")
            
            # Check for exact duplicate (same hash AND size)
            existing_file = File.objects.filter(content_hash=content_hash).first()
            
            if existing_file:
                print(f"Duplicate found - Existing file: {existing_file.original_filename}, Hash: {existing_file.content_hash}")
                # Create a file reference instead of rejecting the upload
                try:
                    reference = FileReference.objects.create(
                        original_file=existing_file,
                        reference_name=file_obj.name
                    )
                    return Response({
                        'message': f'File content already exists as {existing_file.original_filename}. Created a reference instead.',
                        'type': 'reference',
                        'reference': FileReferenceSerializer(reference).data
                    }, status=status.HTTP_201_CREATED)
                except Exception as e:
                    print(f"Error creating reference: {str(e)}")
                    return Response({
                        'error': 'Duplicate file',
                        'message': f'This file appears to be identical to {existing_file.original_filename}',
                        'type': 'duplicate',
                    }, status=status.HTTP_409_CONFLICT)
            
            # Create new file
            serializer = self.get_serializer(data={
                'file': file_obj,
                'original_filename': file_obj.name,
                'file_type': file_obj.content_type,
                'size': file_obj.size,
                'content_hash': content_hash
            })
            
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            self._invalidate_cache()
            
            print(f"File uploaded successfully - Name: {file_obj.name}, Hash: {content_hash}")
            
            headers = self.get_success_headers(serializer.data)
            return Response({
                'message': 'File uploaded successfully',
                'type': 'original',
                'file': serializer.data
            }, status=status.HTTP_201_CREATED, headers=headers)
            
        except IntegrityError as e:
            print(f"IntegrityError during upload - Name: {file_obj.name}, Error: {str(e)}")
            # Try to find the existing file to provide better error message
            existing = File.objects.filter(content_hash=content_hash).first()
            message = f'A file with the same content already exists: {existing.original_filename}' if existing else 'A file with the same content already exists.'
            return Response({
                'error': 'Duplicate file',
                'message': message,
                'type': 'duplicate',
            }, status=status.HTTP_409_CONFLICT)
        except Exception as e:
            print(f"Error during upload - Name: {file_obj.name}, Error: {str(e)}")
            return Response({
                'error': 'Upload failed',
                'message': str(e) if settings.DEBUG else 'An error occurred while uploading the file. Please try again.'
            }, status=status.HTTP_400_BAD_REQUEST)

    @swagger_auto_schema(
        operation_description="Delete a file",
        responses={
            204: "File deleted successfully",
            404: "File not found",
            409: "Cannot delete file with references"
        }
    )
    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """
        Delete a file. Cannot delete files that have references.
        """
        instance = self.get_object()
        
        try:
            # Use select_for_update to prevent race conditions
            instance = File.objects.filter(pk=instance.pk).select_for_update().get()
            
            # Get the actual count of references
            reference_count = instance.references.count()
            
            if reference_count > 0:
                return Response({
                    'error': 'Cannot delete',
                    'message': f'This file has {reference_count} references. Delete the references first.',
                }, status=status.HTTP_409_CONFLICT)
            
            # If we get here, there are no references, so we can delete
            self.perform_destroy(instance)
            
            # Clear cache after deletion
            self._invalidate_cache()
            
            return Response(status=status.HTTP_204_NO_CONTENT)
            
        except File.DoesNotExist:
            return Response({
                'error': 'Not found',
                'message': 'The file no longer exists.',
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({
                'error': 'Delete failed',
                'message': str(e) if settings.DEBUG else 'Failed to delete the file.',
            }, status=status.HTTP_400_BAD_REQUEST)

class FileReferenceViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """
    API endpoint for managing file references.
    """
    queryset = FileReference.objects.all()
    serializer_class = FileReferenceSerializer
    filter_backends = [django_filters.DjangoFilterBackend]
    filterset_fields = ['original_file']

    @swagger_auto_schema(
        operation_description="List references for a file",
        manual_parameters=[
            openapi.Parameter('original_file', openapi.IN_QUERY, description="Filter by original file ID", type=openapi.TYPE_STRING),
        ],
        responses={
            200: openapi.Response(
                description="List of references",
                schema=openapi.Schema(
                    type=openapi.TYPE_OBJECT,
                    properties={
                        'count': openapi.Schema(type=openapi.TYPE_INTEGER),
                        'next': openapi.Schema(type=openapi.TYPE_STRING, nullable=True),
                        'previous': openapi.Schema(type=openapi.TYPE_STRING, nullable=True),
                        'results': openapi.Schema(
                            type=openapi.TYPE_ARRAY,
                            items=openapi.Schema(
                                type=openapi.TYPE_OBJECT,
                                properties={
                                    'id': openapi.Schema(type=openapi.TYPE_STRING),
                                    'reference_name': openapi.Schema(type=openapi.TYPE_STRING),
                                    'created_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
                                    'original_file': openapi.Schema(type=openapi.TYPE_STRING),
                                }
                            )
                        )
                    }
                )
            )
        }
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @swagger_auto_schema(
        operation_description="Delete a file reference",
        responses={
            204: "Reference deleted successfully",
            404: "Reference not found"
        }
    )
    def destroy(self, request, *args, **kwargs):
        """
        Delete a file reference.
        """
        return super().destroy(request, *args, **kwargs)