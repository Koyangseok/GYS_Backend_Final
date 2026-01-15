# GYS 백엔드 API 서버 배포 가이드

## 1. Firebase Admin SDK 설정

1. Firebase Console 접속: https://console.firebase.google.com
2. 프로젝트 선택 (gys-viewing-history)
3. 설정(톱니바퀴) > 프로젝트 설정 > 서비스 계정
4. "새 비공개 키 생성" 클릭
5. JSON 파일 다운로드

## 2. Vercel 배포

### 2-1. Vercel 계정 생성
1. https://vercel.com 접속
2. GitHub 계정으로 가입

### 2-2. GitHub에 코드 업로드
```bash
# GitHub에 새 레포지토리 생성 (예: gys-backend)
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/gys-backend.git
git push -u origin main
```

### 2-3. Vercel에 배포
1. Vercel 대시보드에서 "New Project" 클릭
2. GitHub 레포지토리 연결 (gys-backend)
3. "Environment Variables" 설정:
   - `FIREBASE_PROJECT_ID`: gys-viewing-history
   - `FIREBASE_CLIENT_EMAIL`: (다운받은 JSON 파일의 client_email)
   - `FIREBASE_PRIVATE_KEY`: (다운받은 JSON 파일의 private_key, 따옴표 포함)
4. "Deploy" 클릭

### 2-4. 배포 완료
- 배포된 URL 확인 (예: https://gys-backend.vercel.app)
- API 엔드포인트: https://gys-backend.vercel.app/api/auth

## 3. Chrome Extension 수정

배포된 API URL을 Chrome Extension의 `background.js`에 설정:

```javascript
const API_URL = 'https://gys-backend.vercel.app/api/auth';
```

## 4. 테스트

### API 테스트
```bash
curl -X POST https://gys-backend.vercel.app/api/auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "verifyToken",
    "idToken": "YOUR_ID_TOKEN"
  }'
```

## 5. 보안 강화 (선택사항)

### 5-1. 특정 도메인만 허용
`api/auth.js`의 CORS 헤더 수정:
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'chrome-extension://YOUR_EXTENSION_ID',
  // ...
};
```

### 5-2. Rate Limiting 추가
Vercel의 Edge Config 또는 Redis 사용

## 문제 해결

### 1. CORS 에러
- Vercel 환경 변수 확인
- CORS 헤더 설정 확인

### 2. Firebase 인증 실패
- 환경 변수의 PRIVATE_KEY에 `\n`이 제대로 포함되었는지 확인
- Service Account JSON 파일 재확인

### 3. 배포 실패
- Node.js 버전 확인 (18.x 이상)
- package.json 의존성 확인

## 비용

- **Vercel**: 무료 플랜으로 충분 (월 100GB 대역폭, 무제한 요청)
- **Firebase**: Firestore 읽기/쓰기 일일 할당량 내 무료
