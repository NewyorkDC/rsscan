// backend/server.js
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const path    = require('path');
const { fetchAllETFs } = require('./services/yahooFinance');

const app = express();
app.use(cors({
  origin: ['https://rsscan.vercel.app', 'https://rsscan-git-main-newyorkdcs-projects.vercel.app', 'http://localhost:3000']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

function makeBot(token) { return new TelegramBot(token, { polling: false }); }

const alertConfigs = new Map();

app.get('/api/etfs', async (req, res) => {
  try {
    const data = await fetchAllETFs();
    res.json({ ok: true, data, updatedAt: new Date().toISOString(), count: data.length });
  } catch (err) {
    console.error('/api/etfs 오류:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/etfs/:ticker', async (req, res) => {
  try {
    const all  = await fetchAllETFs();
    const item = all.find(r => r.ticker === req.params.ticker.toUpperCase());
    if (!item) return res.status(404).json({ ok: false, error: '종목 없음' });
    res.json({ ok: true, data: item });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/alerts/config', (req, res) => {
  const { token, chatId, threshold, conditions } = req.body;
  if (!token || !chatId) return res.status(400).json({ ok: false, error: 'token/chatId 필수' });
  alertConfigs.set(String(chatId), { token, chatId: String(chatId), threshold: threshold ?? 80, conditions });
  res.json({ ok: true });
});

app.post('/api/alerts/test', async (req, res) => {
  const { token, chatId } = req.body;
  if (!token || !chatId) return res.status(400).json({ ok: false, error: 'token/chatId 필수' });
  try {
    await makeBot(token).sendMessage(chatId,
      `🔔 <b>RSSCAN 테스트 알림</b>\n\n✅ 텔레그램 연동 성공!\n<i>RS Line 스크리너</i>`,
      { parse_mode: 'HTML' }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

function fmt(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; }

async function sendAlerts(data) {
  for (const [chatId, cfg] of alertConfigs) {
    try {
      const triggered = data.filter(r => {
        if (r.rsLineScore < cfg.threshold) return false;
        const c = cfg.conditions ?? {};
        return (c.accel && r.acceleration) || (c.rsHigh && r.rsHigh) ||
               (c.phaseChange && r.phase >= 4) || (c.priceHigh && r.priceHigh);
      }).slice(0, 10);
      if (!triggered.length) continue;
      const lines = triggered.map(r =>
        `• <b>${r.ticker}</b>  RS <b>${r.rsLineScore}</b>점  Phase${r.phase}  1주 ${fmt(r.w1)}`
      ).join('\n');
      const msg = `📊 <b>RSSCAN 일일 알림</b>\n${new Date().toLocaleDateString('ko-KR')}\n\n${lines}\n\n<i>RS ≥ ${cfg.threshold} | ${triggered.length}개 종목</i>`;
      await makeBot(cfg.token).sendMessage(chatId, msg, { parse_mode: 'HTML' });
      console.log(`[알림] ${chatId}에 ${triggered.length}개 전송`);
    } catch (err) {
      console.error(`[알림 오류] ${chatId}:`, err.message);
    }
  }
}

// 평일 오후 4시 05분 EST (장 마감 후)
cron.schedule('5 16 * * 1-5', async () => {
  console.log('[스케줄러] 장 마감 알림 체크...');
  try { await sendAlerts(await fetchAllETFs()); }
  catch (err) { console.error('[스케줄러 오류]', err.message); }
}, { timezone: 'America/New_York' });

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ RSSCAN 실행 중: http://localhost:${PORT}`);
  console.log(`   Yahoo Finance 연동: 활성\n`);
});
