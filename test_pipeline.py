import requests

def test_pipeline():
    signup_data = {'name': 'Test User', 'email': 'tester@example.com', 'password': 'password123'}
    r = requests.post('http://localhost:8000/api/auth/signup', data=signup_data)
    if r.status_code == 409:
        r = requests.post('http://localhost:8000/api/auth/login', data={'email': 'tester@example.com', 'password': 'password123'})
    
    assert r.status_code == 200, f"Auth failed: {r.text}"
    auth_resp = r.json()
    token = auth_resp['token']
    print('Auth success for:', auth_resp['user']['email'])

    with open('test_assets/dog.jpg', 'rb') as img_f, open('test_assets/question.mp3', 'rb') as aud_f:
        files = {
            'image': ('dog.jpg', img_f, 'image/jpeg'),
            'audio': ('question.mp3', aud_f, 'audio/mpeg')
        }
        headers = {'Authorization': f'Bearer {token}'}
        print('Sending /api/analyze request with image and audio...')
        response = requests.post('http://localhost:8000/api/analyze', files=files, headers=headers)

    print('Status code:', response.status_code)
    if response.status_code == 200:
        data = response.json()
        print('SUCCESS! Multimodal Answer from Gemini:')
        print(data.get('answer'))
        print('Generated Voice Base64 length:', len(data.get('audio', '')))
    else:
        print('ERROR Response:', response.text)

if __name__ == '__main__':
    test_pipeline()
