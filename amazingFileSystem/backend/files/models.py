from django.db import models, transaction
from django.db.models import F, Case, When
import uuid
import os
import hashlib

def calculate_file_hash(file):
    """Calculate SHA-256 hash of file content"""
    sha256_hash = hashlib.sha256()
    
    # Store original position
    original_pos = file.tell()
    
    try:
        # Reset to beginning of file
        file.seek(0)
        
        if hasattr(file, 'chunks'):
            # For UploadedFile objects
            for chunk in file.chunks():
                sha256_hash.update(chunk)
        else:
            # For regular file objects
            while True:
                chunk = file.read(4096)
                if not chunk:
                    break
                sha256_hash.update(chunk)
    finally:
        # Restore original position
        file.seek(original_pos)
    
    return sha256_hash.hexdigest()

def file_upload_path(instance, filename):
    """Generate file path for new file upload"""
    ext = filename.split('.')[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    return os.path.join('uploads', filename)

def generate_default_hash():
    """Generate a default hash for existing records"""
    return hashlib.sha256(b'default').hexdigest()

class File(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to=file_upload_path)
    original_filename = models.CharField(max_length=255, db_index=True)
    file_type = models.CharField(max_length=100, db_index=True)
    size = models.BigIntegerField(db_index=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    content_hash = models.CharField(
        max_length=64,
        db_index=True,
        null=True,  # Allow null initially
    )
    reference_count = models.PositiveIntegerField(default=1)  # Track number of references
    storage_saved = models.BigIntegerField(default=0)  # Track storage saved by deduplication
    
    class Meta:
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['original_filename', 'file_type']),
            models.Index(fields=['size', 'uploaded_at']),
            models.Index(fields=['content_hash', 'size']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['content_hash'],
                name='unique_content_hash',
                condition=models.Q(content_hash__isnull=False)
            )
        ]

    def __str__(self):
        return self.original_filename

    def save(self, *args, update_fields=None, **kwargs):
        # Calculate hash if not already set
        if not self.content_hash and self.file:
            self.content_hash = calculate_file_hash(self.file)
        
        # Calculate storage saved
        if self.reference_count > 1:
            # Storage saved is the size of the file times the number of references minus 1
            # (minus 1 because the original file is not counted as saving space)
            self.storage_saved = self.size * (self.reference_count - 1)
        else:
            self.storage_saved = 0
            
        super().save(*args, update_fields=update_fields, **kwargs)

    @transaction.atomic
    def update_reference_count(self, change):
        """Update reference count and storage saved atomically"""
        # Get current reference count to prevent going below 1
        current_count = File.objects.filter(pk=self.pk).values('reference_count')[0]['reference_count']
        new_count = current_count + change
        
        # Ensure reference count never goes below 1
        if new_count < 1:
            new_count = 1
            
        # Update using the calculated new count
        File.objects.filter(pk=self.pk).update(
            reference_count=new_count,
            storage_saved=Case(
                When(reference_count__gt=1, 
                     then=F('size') * (new_count - 1)),
                default=0,
                output_field=models.BigIntegerField()
            )
        )
        # Refresh from db to get updated values
        self.refresh_from_db()

class FileReference(models.Model):
    """Model to store references to existing files"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    original_file = models.ForeignKey(File, on_delete=models.CASCADE, related_name='references')
    reference_name = models.CharField(max_length=255, unique=True)  # The name used for this reference
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.reference_name} -> {self.original_file.original_filename}"

    @transaction.atomic
    def save(self, *args, **kwargs):
        # Increment reference count when creating a new reference
        if not self.pk:  # Only on creation
            self.original_file.update_reference_count(1)
        super().save(*args, **kwargs)

    @transaction.atomic
    def delete(self, *args, **kwargs):
        # Decrement reference count when deleting a reference
        self.original_file.update_reference_count(-1)
        super().delete(*args, **kwargs) 