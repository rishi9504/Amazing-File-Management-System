from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FileViewSet, FileReferenceViewSet

router = DefaultRouter()
router.register(r'files', FileViewSet, basename='file')
router.register(r'references', FileReferenceViewSet, basename='reference')

urlpatterns = [
    path('', include(router.urls)),
] 