from rest_framework import serializers
from .models import File, FileReference

class FileSerializer(serializers.ModelSerializer):
    reference_count = serializers.IntegerField(read_only=True)
    storage_saved = serializers.IntegerField(read_only=True)
    storage_saved_formatted = serializers.SerializerMethodField()
    
    def get_storage_saved_formatted(self, obj):
        """Return human-readable storage saved"""
        bytes = obj.storage_saved
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if bytes < 1024:
                return f"{bytes:.2f} {unit}"
            bytes /= 1024
        return f"{bytes:.2f} PB"
    
    class Meta:
        model = File
        fields = ['id', 'file', 'original_filename', 'file_type', 'size', 'uploaded_at', 
                 'content_hash', 'reference_count', 'storage_saved', 'storage_saved_formatted']
        read_only_fields = ['id', 'uploaded_at', 'content_hash', 'reference_count', 
                           'storage_saved', 'storage_saved_formatted']

class FileReferenceSerializer(serializers.ModelSerializer):
    original_file = FileSerializer(read_only=True)
    
    class Meta:
        model = FileReference
        fields = ['id', 'original_file', 'reference_name', 'created_at']
        read_only_fields = ['id', 'created_at'] 