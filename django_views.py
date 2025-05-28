"""
Django views for JSON Parser application.
JSON解析器应用的Django视图
"""

import json
import logging
from typing import Dict, Any, List
from django.conf import settings
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views import View
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
import os
import uuid
from datetime import datetime

# Configure logger
logger = logging.getLogger('json_parser')

class JSONValidationError(Exception):
    """Custom exception for JSON validation errors"""
    pass

class JSONParserView(APIView):
    """
    API view for parsing and validating JSON data
    用于解析和验证JSON数据的API视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        Parse and validate JSON data from request
        解析和验证请求中的JSON数据
        """
        try:
            # Get JSON data from request
            if request.content_type == 'application/json':
                json_data = request.data
            else:
                json_string = request.data.get('json_string', '')
                if not json_string:
                    return Response({
                        'error': 'No JSON data provided',
                        'message': '未提供JSON数据'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                json_data = json.loads(json_string)

            # Validate JSON structure
            validation_result = self._validate_json_structure(json_data)
            
            if not validation_result['is_valid']:
                return Response({
                    'error': 'JSON validation failed',
                    'message': validation_result['error'],
                    'details': validation_result.get('details', [])
                }, status=status.HTTP_400_BAD_REQUEST)

            # Analyze JSON data
            analysis = self._analyze_json_data(json_data)
            
            # Log successful parsing
            logger.info(f"JSON parsed successfully. Keys: {analysis['total_keys']}, Depth: {analysis['max_depth']}")
            
            return Response({
                'success': True,
                'message': 'JSON解析成功',
                'data': json_data,
                'analysis': analysis,
                'timestamp': datetime.now().isoformat()
            }, status=status.HTTP_200_OK)

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {str(e)}")
            return Response({
                'error': 'Invalid JSON format',
                'message': f'JSON格式错误: {str(e)}',
                'line': getattr(e, 'lineno', None),
                'column': getattr(e, 'colno', None)
            }, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            logger.error(f"Unexpected error in JSON parsing: {str(e)}")
            return Response({
                'error': 'Internal server error',
                'message': f'服务器内部错误: {str(e)}'
            }, status=status.HTTP_
500_INTERNAL_SERVER_ERROR)

    def _validate_json_structure(self, data: Any) -> Dict[str, Any]:
        """
        Validate JSON structure according to configured limits
        根据配置的限制验证JSON结构
        """
        try:
            settings_config = getattr(settings, 'JSON_PARSER_SETTINGS', {})
            max_depth = settings_config.get('MAX_DEPTH', 10)
            max_keys = settings_config.get('MAX_KEYS', 1000)
            
            # Check depth
            depth = self._calculate_json_depth(data)
            if depth > max_depth:
                return {
                    'is_valid': False,
                    'error': f'JSON depth exceeds maximum limit of {max_depth}',
                    'details': {'current_depth': depth, 'max_depth': max_depth}
                }
            
            # Check number of keys
            key_count = self._count_json_keys(data)
            if key_count > max_keys:
                return {
                    'is_valid': False,
                    'error': f'JSON key count exceeds maximum limit of {max_keys}',
                    'details': {'current_keys': key_count, 'max_keys': max_keys}
                }
            
            return {'is_valid': True}
            
        except Exception as e:
            return {
                'is_valid': False,
                'error': f'Validation error: {str(e)}'
            }

    def _calculate_json_depth(self, data: Any, current_depth: int = 1) -> int:
        """Calculate the maximum depth of JSON structure"""
        if isinstance(data, dict):
            if not data:
                return current_depth
            return max(self._calculate_json_depth(value, current_depth + 1) 
                      for value in data.values())
        elif isinstance(data, list):
            if not data:
                return current_depth
            return max(self._calculate_json_depth(item, current_depth + 1) 
                      for item in data)
        else:
            return current_depth

    def _count_json_keys(self, data: Any) -> int:
        """Count total number of keys in JSON structure"""
        if isinstance(data, dict):
            count = len(data)
            for value in data.values():
                count += self._count_json_keys(value)
            return count
        elif isinstance(data, list):
            count = 0
            for item in data:
                count += self._count_json_keys(item)
            return count
        else:
            return 0

    def _analyze_json_data(self, data: Any) -> Dict[str, Any]:
        """
        Analyze JSON data and return statistics
        分析JSON数据并返回统计信息
        """
        analysis = {
            'total_keys': self._count_json_keys(data),
            'max_depth': self._calculate_json_depth(data),
            'data_types': self._analyze_data_types(data),
            'array_count': self._count_arrays(data),
            'object_count': self._count_objects(data),
            'size_bytes': len(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        }
        return analysis

    def _analyze_data_types(self, data: Any) -> Dict[str, int]:
        """Analyze and count different data types in JSON"""
        types = {'string': 0, 'number': 0, 'boolean': 0, 'null': 0, 'array': 0, 'object': 0}
        
        def count_types(item):
            if isinstance(item, str):
                types['string'] += 1
            elif isinstance(item, (int, float)):
                types['number'] += 1
            elif isinstance(item, bool):
                types['boolean'] += 1
            elif item is None:
                types['null'] += 1
            elif isinstance(item, list):
                types['array'] += 1
                for sub_item in item:
                    count_types(sub_item)
            elif isinstance(item, dict):
                types['object'] += 1
                for value in item.values():
                    count_types(value)
        
        count_types(data)
        return types

    def _count_arrays(self, data: Any) -> int:
        """Count number of arrays in JSON structure"""
        count = 0
        if isinstance(data, list):
            count = 1
            for item in data:
                count += self._count_arrays(item)
        elif isinstance(data, dict):
            for value in data.values():
                count += self._count_arrays(value)
        return count

    def _count_objects(self, data: Any) -> int:
        """Count number of objects in JSON structure"""
        count = 0
        if isinstance(data, dict):
            count = 1
            for value in data.values():
                count += self._count_objects(value)
        elif isinstance(data, list):
            for item in data:
                count += self._count_objects(item)
        return count


class JSONFileUploadView(APIView):
    """
    API view for handling JSON file uploads
    处理JSON文件上传的API视图
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        Handle JSON file upload and processing
        处理JSON文件上传和处理
        """
        try:
            if 'json_file' not in request.FILES:
                return Response({
                    'error': 'No file provided',
                    'message': '未提供文件'
                }, status=status.HTTP_400_BAD_REQUEST)

            uploaded_file = request.FILES['json_file']
            
            # Validate file
            validation_result = self._validate_uploaded_file(uploaded_file)
            if not validation_result['is_valid']:
                return Response({
                    'error': 'File validation failed',
                    'message': validation_result['error']
                }, status=status.HTTP_400_BAD_REQUEST)

            # Read and parse JSON content
            file_content = uploaded_file.read().decode('utf-8')
            json_data = json.loads(file_content)
            
            # Save file
            saved_file_info = self._save_uploaded_file(uploaded_file, file_content)
            
            # Analyze JSON data
            analysis = JSONParserView()._analyze_json_data(json_data)
            
            logger.info(f"JSON file uploaded successfully: {uploaded_file.name}")
            
            return Response({
                'success': True,
                'message': 'JSON文件上传和解析成功',
                'file_info': saved_file_info,
                'data': json_data,
                'analysis': analysis,
                'timestamp': datetime.now().isoformat()
            }, status=status.HTTP_200_OK)

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in uploaded file: {str(e)}")
            return Response({
                'error': 'Invalid JSON file',
                'message': f'无效的JSON文件: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            logger.error(f"Error processing uploaded file: {str(e)}")
            return Response({
                'error': 'File processing error',
                'message': f'文件处理错误: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _validate_uploaded_file(self, uploaded_file) -> Dict[str, Any]:
        """Validate uploaded file"""
        settings_config = getattr(settings, 'JSON_PARSER_SETTINGS', {})
        max_size = settings_config.get('MAX_FILE_SIZE', 10 * 1024 * 1024)
        allowed_extensions = settings_config.get('ALLOWED_EXTENSIONS', ['.json'])
        
        # Check file size
        if uploaded_file.size > max_size:
            return {
                'is_valid': False,
                'error': f'File size exceeds maximum limit of {max_size} bytes'
            }
        
        # Check file extension
        file_extension = os.path.splitext(uploaded_file.name)[1].lower()
        if file_extension not in allowed_extensions:
            return {
                'is_valid': False,
                'error': f'File extension {file_extension} not allowed'
            }
        
        return {'is_valid': True}

    def _save_uploaded_file(self, uploaded_file, content: str) -> Dict[str, Any]:
        """Save uploaded file to storage"""
        settings_config = getattr(settings, 'JSON_PARSER_SETTINGS', {})
        upload_path = settings_config.get('UPLOAD_PATH', 'json_uploads/')
        
        # Generate unique filename
        unique_id = str(uuid.uuid4())
        file_extension = os.path.splitext(uploaded_file.name)[1]
        filename = f"{unique_id}{file_extension}"
        filepath = os.path.join(upload_path, filename)
        
        # Save file
        saved_path = default_storage.save(filepath, ContentFile(content.encode('utf-8')))
        
        return {
            'original_name': uploaded_file.name,
            'saved_name': filename,
            'saved_path': saved_path,
            'size': uploaded_file.size,
            'upload_time': datetime.now().isoformat()
        }


@api_view(['GET'])
@permission_classes([AllowAny])
def get_sample_json(request):
    """
    Return sample JSON data for testing
    返回用于测试的示例JSON数据
    """
    sample_data = {
        "用户信息": {
            "姓名": "张三",
            "年龄": 28,
            "职业": "全栈开发工程师",
            "技能": ["JavaScript", "Python", "Django", "React"],
            "联系方式": {
                "邮箱": "zhangsan@example.com",
                "电话": "138-0000-1234"
            }
        },
        "项目经验": [
            {
                "项目名称": "电商平台",
                "技术栈": ["Django", "PostgreSQL", "Redis"],
                "状态": "已完成"
            },
            {
                "项目名称": "数据分析系统",
                "技术栈": ["Python", "Pandas", "Django REST Framework"],
                "状态": "进行中"
            }
        ],
        "配置": {
            "主题": "dark",
            "语言": "zh-CN",
            "通知": True,
            "数据同步": False
        }
    }
    
    return Response({
        'success': True,
        'data': sample_data,
        'message': '示例JSON数据获取成功',
        'timestamp': datetime.now().isoformat()
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Health check endpoint for monitoring
    用于监控的健康检查端点
    """
    return Response({
        'status': 'healthy',
        'message': 'JSON Parser API is running',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })


# Function-based view for simple JSON parsing (alternative approach)
@csrf_exempt
@require_http_methods(["POST"])
def simple_json_parse(request):
    """
    Simple function-based view for JSON parsing
    用于JSON解析的简单函数视图
    """
    try:
        body = json.loads(request.body)
        json_string = body.get('json_string', '')
        
        if not json_string:
            return JsonResponse({
                'error': 'No JSON string provided'
            }, status=400)
        
        parsed_data = json.loads(json_string)
        
        return JsonResponse({
            'success': True,
            'data': parsed_data,
            'message': 'JSON parsed successfully'
        })
    
    except json.JSONDecodeError as e:
        return JsonResponse({
            'error': f'JSON decode error: {str(e)}'
        }, status=400)
    
    except Exception as e:
        return JsonResponse({
            'error': f'Server error: {str(e)}'
        }, status=500)
