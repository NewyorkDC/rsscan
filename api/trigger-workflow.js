/**
 * GitHub Actions 워크플로우 수동 실행 API
 * Vercel Serverless Function
 * 
 * 문제 수정:
 * - 204 No Content 응답 처리
 * - 에러 응답은 text()로 읽기
 * - 디버그 로깅 추가
 */

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // POST만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = 'NewyorkDC';
    const GITHUB_REPO = 'rsscan';
    const WORKFLOW_ID = 'daily_scan.yml';

    if (!GITHUB_TOKEN) {
      console.error('[ERROR] GITHUB_TOKEN not configured');
      return res.status(500).json({ 
        error: 'GitHub token not configured',
        message: 'GITHUB_TOKEN 환경변수가 설정되지 않았습니다.'
      });
    }

    // GitHub API 주소 (api.github.com으로 시작해야 함)
    const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`;

    console.log(`[DEBUG] GitHub API URL: ${GITHUB_API_URL}`);
    console.log(`[DEBUG] Token exists: ${GITHUB_TOKEN ? '✅' : '❌'}`);
    console.log(`[DEBUG] Token length: ${GITHUB_TOKEN.length}`);

    // 실제 요청을 보내는 코드
    const response = await fetch(GITHUB_API_URL, {
      method: 'POST',
      headers: {
        // 주의: Bearer 뒤에 띄어쓰기 1칸 필수
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main'
      })
    });

    console.log(`[DEBUG] Response status: ${response.status}`);
    console.log(`[DEBUG] Response headers:`, {
      'content-type': response.headers.get('content-type'),
      'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining')
    });

    // 성공 처리 (204 No Content)
    if (response.status === 204) {
      console.log('✅ GitHub Action 수동 실행 요청 성공!');
      return res.status(200).json({
        success: true,
        message: '✅ 분석 작업이 시작되었습니다!',
        details: 'GitHub Actions 워크플로우가 실행 중입니다. 5~10분 정도 소요됩니다.',
        actionUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`,
        timestamp: new Date().toISOString()
      });
    }

    // 에러 처리 로직
    if (!response.ok) {
      // JSON 파싱 시도 전에 text로 먼저 에러 내용을 뽑아냅니다
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read response body';
      }
      
      console.error(`[ERROR] GitHub API 에러 (${response.status}):`, errorText);
      
      return res.status(response.status).json({
        error: 'GitHub API error',
        status: response.status,
        message: errorText.substring(0, 200), // 처음 200자만
        details: `GitHub Actions 실행 요청 실패: ${response.status}`,
        hint: '토큰이 유효한지, 워크플로우 파일명이 정확한지 확인하세요.'
      });
    }

    // 예상치 못한 성공 상태코드
    console.warn(`[WARN] Unexpected success status: ${response.status}`);
    return res.status(200).json({
      success: true,
      message: '✅ 분석 작업이 시작되었습니다!',
      details: 'GitHub Actions 워크플로우가 실행 중입니다.',
      actionUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[ERROR] Workflow trigger error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: error.toString(),
      hint: '서버 로그를 확인하세요.'
    });
  }
}
