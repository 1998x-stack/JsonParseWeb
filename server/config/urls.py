from django.urls import path
from server.processor.views import parse_json, upload_json, sample_json, health

urlpatterns = [
    path('api/parse/', parse_json, name='json-parse'),
    path('api/upload/', upload_json, name='json-upload'),
    path('api/sample/', sample_json, name='json-sample'),
    path('api/health/', health, name='health'),
]
