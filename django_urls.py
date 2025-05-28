"""
URL configuration for JSON Parser Django project.
JSON解析器Django项目的URL配置
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from . import views

# API URL patterns
api_patterns = [
    path('parse/', views.JSONParserView.as_view(), name='json_parse'),
    path('upload/', views.JSONFileUploadView.as_view(), name='json_upload'),
    path('sample/', views.get_sample_json, name='sample_json'),
    path('health/', views.health_check, name='health_check'),
    path('simple-parse/', views.simple_json_parse, name='simple_json_parse'),
]

# Main URL patterns
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(api_patterns)),
    path('api-auth/', include('rest_framework.urls')),
]

# Serve static and media files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Add API documentation (optional)
if 'rest_framework' in settings.INSTALLED_APPS:
    try:
        from rest_framework.documentation import include_docs_urls
        urlpatterns += [
            path('docs/', include_docs_urls(title='JSON Parser API Documentation')),
        ]
    except ImportError:
        pass
