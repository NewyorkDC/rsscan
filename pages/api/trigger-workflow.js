/**
 * GitHub Actions 워크플로우 수동 실행 API
 * Vercel Serverless Function
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
      return res.status(500).json({ 
        error: 'GitHub token not configured',
        message: 'GITHUB_TOKEN 환경변수가 설정되지 않았습니다.'
      });
    }

    // GitHub API 호출
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main'
        })
      }
    );

    if (response.status === 204) {
      return res.status(200).json({
        success: true,
        message: '✅ 분석 작업이 시작되었습니다!',
        details: 'GitHub Actions 워크플로우가 실행 중입니다.',
        actionUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`,
        timestamp: new Date().toISOString()
      });
    } else if (response.status === 422) {
      return res.status(422).json({
        error: 'Workflow dispatch failed',
        message: '워크플로우 실행에 실패했습니다.'
      });
    } else {
      const errorData = await response.json();
      return res.status(response.status).json({
        error: 'GitHub API error',
        message: errorData.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Workflow trigger error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
