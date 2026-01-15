// Vercel Serverless Function - 인증 처리
const admin = require('firebase-admin');

// Firebase Admin 초기화 (환경 변수 사용)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

// ==================== 서버사이드 데이터 처리 로직 ====================

// 제목 정리
function cleanTitle(title) {
  if (!title) return '제목 없음';
  
  let cleaned = title.trim();
  
  const patternsToRemove = [
    /\s*[-|]\s*티비위키.*$/i,
    /\s*[-|]\s*tvwiki.*$/i,
    /\s*[-|]\s*Anilife.*$/i,
    /\s*[-|]\s*anilife.*$/i,
    /\s*[-|]\s*애니라이프.*$/i,
    /\s*[-|]\s*시청.*$/i,
    /\s*[-|]\s*재생.*$/i,
    /\s*[-|]\s*플레이어.*$/i,
    /\s*[-|]\s*Player.*$/i,
    /\s*[-|]\s*.+\.(com|net|app|kr).*$/i,
  ];
  
  patternsToRemove.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  cleaned = cleaned.trim();
  
  if (cleaned.length < 2) {
    return title.trim();
  }
  
  return cleaned;
}

// 에피소드 추출
function extractEpisode(rawData) {
  const { pageTitle, pageUrl, pathname, search, hash, hostname, h1Text, h2Text, bodyText } = rawData;
  
  // 1. 페이지 제목에서 추출
  const titleMatch = pageTitle.match(/(\d+)\s*화/);
  if (titleMatch) {
    return `${titleMatch[1]}화`;
  }
  
  // 2. Anilife 특화
  if (hostname.includes('anilife')) {
    // h1, h2에서 찾기
    const h1Match = h1Text.match(/(\d+)\s*화/);
    if (h1Match) return `${h1Match[1]}화`;
    
    const h2Match = h2Text.match(/(\d+)\s*화/);
    if (h2Match) return `${h2Match[1]}화`;
    
    // URL 해시
    const hashMatch = hash.match(/\/watch\/(\d+)/i) || 
                      hash.match(/\/episode\/(\d+)/i) ||
                      hash.match(/\/(\d+)/);
    if (hashMatch) return `${hashMatch[1]}화`;
    
    // 쿼리 파라미터
    const urlParams = new URLSearchParams(search);
    const epParam = urlParams.get('ep') || urlParams.get('episode') || urlParams.get('id');
    if (epParam) return `${epParam}화`;
    
    // pathname
    const pathMatch = pathname.match(/\/(?:watch|episode)\/(\d+)/i);
    if (pathMatch) return `${pathMatch[1]}화`;
    
    // body 텍스트 (마지막 수단)
    const bodyMatch = bodyText.match(/(\d+)\s*화/);
    if (bodyMatch) return `${bodyMatch[1]}화`;
  }
  
  // 3. tvwiki: /world/10182 형식
  const worldMatch = pathname.match(/\/world\/(\d+)/i);
  if (worldMatch) return `${worldMatch[1]}화`;
  
  // 4. 일반 패턴
  const episodeMatch = pageUrl.match(/[?&#\/](?:ep|episode)[=\/]?(\d+)/i);
  if (episodeMatch) return `${episodeMatch[1]}화`;
  
  return '';
}

// 최종 제목 결정
function getFinalTitle(rawData) {
  let title = cleanTitle(rawData.pageTitle);
  
  // 제목이 없거나 너무 짧으면 대체
  if (!title || title === '제목 없음' || title.length < 3) {
    // og:title 시도
    if (rawData.metaOgTitle) {
      title = cleanTitle(rawData.metaOgTitle);
    }
    
    // h1 시도
    if ((!title || title.length < 3) && rawData.h1Text) {
      const h1Parts = rawData.h1Text.split('|');
      if (h1Parts[0]) {
        title = cleanTitle(h1Parts[0]);
      }
    }
  }
  
  return title || '제목 없음';
}

// CORS 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  // CORS preflight 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // CORS 헤더 추가
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  try {
    const { action, idToken, email, password, uid, watchHistory } = req.body;

    switch (action) {
      case 'verifyToken':
        // ID 토큰 검증
        const decodedToken = await auth.verifyIdToken(idToken);
        return res.status(200).json({ 
          success: true, 
          uid: decodedToken.uid,
          email: decodedToken.email 
        });

      case 'saveWatchHistory': {
        // 서버에서 raw 데이터 처리
        if (!idToken) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const decoded = await auth.verifyIdToken(idToken);
        const { data } = req.body;
        
        // ==================== 서버에서 데이터 처리 ====================
        const title = getFinalTitle(data);
        const episode = extractEpisode(data);
        const currentTime = data.currentTime;
        const duration = data.duration;
        const progress = Math.floor((currentTime / duration) * 100);
        const thumbnail = data.thumbnail;
        const pageUrl = data.pageUrl;
        
        // 고유 키 생성
        let uniqueKey = '';
        if (episode) {
          uniqueKey = `${title} - ${episode}`;
        } else {
          const urlParams = new URLSearchParams(new URL(pageUrl).search);
          const videoId = urlParams.get('id');
          if (videoId) {
            uniqueKey = `${title} - [${videoId.substring(0, 8)}]`;
          } else {
            uniqueKey = pageUrl;
          }
        }
        
        // 처리된 데이터
        const processedData = {
          title,
          episode,
          url: pageUrl,
          uniqueKey,
          thumbnail,
          currentTime,
          duration,
          progress,
          id: pageUrl,
          lastWatched: Date.now()
        };
        
        console.log('[Server] 데이터 처리 완료:', {
          원본제목: data.pageTitle,
          처리된제목: title,
          에피소드: episode
        });
        
        // ==================== 기존 기록과 병합 ====================
        const docRef = db.collection('users').doc(decoded.uid);
        const doc = await docRef.get();
        const currentHistory = doc.exists && doc.data().watchHistory ? doc.data().watchHistory : [];
        
        const existingIndex = currentHistory.findIndex(item => item.url === pageUrl);
        
        if (existingIndex >= 0) {
          currentHistory[existingIndex] = processedData;
        } else {
          currentHistory.unshift(processedData);
        }
        
        const limitedHistory = currentHistory.slice(0, 100);
        
        await docRef.set({
          email: decoded.email,
          watchHistory: limitedHistory,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({ success: true, history: limitedHistory });
      }

      case 'getWatchHistory': {
        // 시청 기록 불러오기 (정렬 포함)
        if (!idToken) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const decoded = await auth.verifyIdToken(idToken);
        const doc = await db.collection('users').doc(decoded.uid).get();
        
        let history = doc.exists && doc.data().watchHistory ? doc.data().watchHistory : [];
        
        // 서버에서 정렬
        history = history.sort((a, b) => b.lastWatched - a.lastWatched);
        
        return res.status(200).json({ 
          success: true, 
          history: history 
        });
      }

      case 'deleteHistory': {
        // 개별 기록 삭제
        if (!idToken) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const decoded = await auth.verifyIdToken(idToken);
        const { historyId } = req.body;
        
        const docRef = db.collection('users').doc(decoded.uid);
        const doc = await docRef.get();
        
        if (doc.exists && doc.data().watchHistory) {
          const filtered = doc.data().watchHistory.filter(item => item.id !== historyId);
          
          await docRef.update({
            watchHistory: filtered,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
          
          return res.status(200).json({ success: true, history: filtered });
        }
        
        return res.status(200).json({ success: true, history: [] });
      }

      case 'clearAllHistory': {
        // 전체 기록 삭제
        if (!idToken) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const decoded = await auth.verifyIdToken(idToken);
        
        await db.collection('users').doc(decoded.uid).update({
          watchHistory: [],
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return res.status(200).json({ success: true, history: [] });
      }

      case 'syncFromCloud': {
        // 클라우드에서 동기화
        if (!idToken) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        
        const decoded = await auth.verifyIdToken(idToken);
        const doc = await db.collection('users').doc(decoded.uid).get();
        
        const history = doc.exists && doc.data().watchHistory ? doc.data().watchHistory : [];
        
        return res.status(200).json({ 
          success: true, 
          history: history.sort((a, b) => b.lastWatched - a.lastWatched)
        });
      }

      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
