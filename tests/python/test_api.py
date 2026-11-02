import pytest
pytest.importorskip('django')
from django.test import Client
from django.core.files.uploadedfile import SimpleUploadedFile

@pytest.fixture
def client():
    return Client()

def test_parse_false(client):
    r = client.post('/api/parse/', data='{"source":"false"}', content_type='application/json')
    assert r.status_code == 200
    assert r.json()['data'] is False

def test_parse_invalid(client):
    r = client.post('/api/parse/', data='{"source":"{invalid"}', content_type='application/json')
    assert r.status_code == 400
    assert r.json()['error']['code'] == 'INVALID_JSON'

def test_upload_no_persistence(client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    file = SimpleUploadedFile('test.json',b'{"a":1}',content_type='application/json')
    r = client.post('/api/upload/', data={'json_file':file})
    assert r.status_code == 200
    assert r.json()['file_info']['stored'] is False
    assert list(tmp_path.iterdir()) == []

def test_health(client):
    assert client.get('/api/health/').json()['status'] == 'ok'
