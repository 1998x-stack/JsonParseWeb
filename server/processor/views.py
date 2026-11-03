"""Opt-in JSON API. The default browser app does not call these endpoints."""
import json
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework.response import Response
from .service import parse_document, JSONDocumentError, MAX_BYTES


def _fail(exc):
    body = {'success': False, 'error': {'code': exc.code, 'message': str(exc)}}
    if exc.line is not None: body['error']['line'] = exc.line
    if exc.column is not None: body['error']['column'] = exc.column
    return Response(body, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle])
def parse_json(request):
    try:
        # Contract: {"source": "..."}; compatibility: direct valid JSON body.
        if isinstance(request.data, dict) and isinstance(request.data.get('source'), str):
            source = request.data['source']
        else:
            source = request.body.decode('utf-8')
        return Response({'success': True, **parse_document(source)})
    except UnicodeError:
        return _fail(JSONDocumentError('INVALID_ENCODING', '文本必须是 UTF-8'))
    except JSONDocumentError as exc:
        return _fail(exc)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle])
def upload_json(request):
    uploaded = request.FILES.get('json_file')
    if uploaded is None:
        return _fail(JSONDocumentError('MISSING_FILE', '请提供 json_file 文件'))
    if not uploaded.name.lower().endswith('.json'):
        return _fail(JSONDocumentError('INVALID_EXTENSION', '仅支持 .json 文件'))
    if uploaded.size > MAX_BYTES:
        return _fail(JSONDocumentError('SIZE_LIMIT', '文件过大'))
    try:
        source = uploaded.read(MAX_BYTES + 1).decode('utf-8')
        result = parse_document(source)
        return Response({'success': True, **result, 'file_info': {'name': uploaded.name, 'size_bytes': uploaded.size, 'stored': False}})
    except UnicodeError:
        return _fail(JSONDocumentError('INVALID_ENCODING', '文件必须是 UTF-8'))
    except JSONDocumentError as exc:
        return _fail(exc)


@api_view(['GET'])
@permission_classes([AllowAny])
def sample_json(request):
    return Response({'success': True, 'data': {'project': 'JsonParseWeb', 'version': '0.2.0', 'local_first': True}})


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok', 'version': '0.2.0'})
