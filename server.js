const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_NAME = process.env.APP_NAME || 'wordgame'; // short name of the Mini App in BotFather
const PORT = process.env.PORT || 3000;
const DEV = process.env.DEV === '1'; // lets you test in a normal browser

const ROUNDS = 5;
const ROUND_MS = 10000;
const REVEAL_MS = 3000;
const WAIT_MS = 25000; // time for players to open the game before the first word
const LEVELS = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };

const WORDS = [
  'کتاب', 'مداد', 'پنجره', 'خورشید', 'دریا', 'گلدان', 'ستاره', 'پرنده',
  'مسافر', 'شیرینی', 'کبوتر', 'آسمان', 'باغچه', 'بازار', 'کلاس', 'مدرسه',
  'هندوانه', 'انار', 'نقاشی', 'موسیقی', 'ماهی', 'درخت', 'دوچرخه', 'تلفن',
  'چراغ', 'زمستان', 'تابستان', 'پاییز', 'شکلات', 'کامپیوتر', 'ساعت', 'خانه',
  'خیابان', 'میوه', 'آینه', 'قاشق', 'بالش', 'ماشین', 'فرودگاه', 'کتابخانه',
];
// easy: up to 4 letters, medium: 5 letters, hard: 6+ letters
const wordsFor = (level) =>
  WORDS.filter((w) => {
    const n = [...w].length;
    return level === 'easy' ? n <= 4 : level === 'medium' ? n === 5 : n >= 6;
  });

const rooms = new Map(); // roomId -> room
const inlineRooms = new Map(); // inline_message_id -> roomId
const pendingOwner = new Map(); // inline_message_id -> uid of the person who created the game
let bot = null;
let botUsername = '';

// ---------- helpers ----------
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const scramble = (w) => {
  const letters = [...w];
  let s = shuffle(letters);
  for (let i = 0; i < 10 && s.join('') === w; i++) s = shuffle(letters);
  return s;
};
const norm = (s) =>
  String(s || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s\u200c\u200d]/g, '')
    .trim();

function createRoom(id, init) {
  const r = {
    id,
    level: init.level,
    hostId: init.hostId,
    hostName: init.hostName,
    inlineMsgId: init.inlineMsgId || null,
    players: new Map(),
    phase: 'lobby', // lobby | waiting | round | reveal | done
    round: 0,
    word: '',
    display: '',
    letters: [],
    used: new Set(),
    timer: null,
    endsAt: 0,
    createdAt: Date.now(),
    updTimer: null,
    lastText: '',
  };
  rooms.set(id, r);
  return r;
}

// Telegram's Mini App login data: verify it really came from Telegram
function parseInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const str = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(str).digest('hex');
    if (calc !== hash) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user) return null;
    return {
      uid: String(user.id),
      name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'ناشناس',
      room: params.get('start_param') || '',
    };
  } catch {
    return null;
  }
}

const send = (ws, m) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
};
const broadcast = (r, m) => r.players.forEach((p) => send(p.ws, m));
const snapshot = (r) => ({
  t: 'state',
  phase: r.phase,
  hostId: r.hostId,
  levelName: LEVELS[r.level],
  players: [...r.players.values()].map((p) => ({
    uid: p.uid,
    name: p.name,
    team: p.team,
    score: p.score,
    online: !!p.ws,
  })),
});
const totals = (r) => {
  const t = { blue: 0, red: 0 };
  r.players.forEach((p) => {
    if (p.team) t[p.team] += p.score;
  });
  return t;
};

function getPlayer(r, from) {
  const uid = String(from.id);
  let p = r.players.get(uid);
  if (!p) {
    p = { uid, name: '', team: null, score: 0, solved: false, ws: null };
    r.players.set(uid, p);
  }
  p.name = ([from.first_name, from.last_name].filter(Boolean).join(' ') || 'ناشناس').slice(0, 30);
  return p;
}

// ---------- the game message inside the Telegram group ----------
function lobbyText(r) {
  const names = (t) =>
    [...r.players.values()].filter((p) => p.team === t).map((p) => p.name).join('، ') || '—';
  const head = `🎯 بازی حدس کلمه (${LEVELS[r.level]})\n👑 میزبان: ${r.hostName}`;
  const teams = `🔵 تیم آبی: ${names('blue')}\n🔴 تیم قرمز: ${names('red')}`;
  if (r.phase === 'lobby') {
    return `${head}\n\n${teams}\n\nبا دکمه‌های پایین تیمت رو انتخاب کن. وقتی همه آماده بودن، میزبان بازی رو شروع می‌کنه.`;
  }
  if (r.phase === 'done') {
    const t = totals(r);
    const w = t.blue === t.red ? '🤝 مساوی شد!' : t.blue > t.red ? '🏆 تیم آبی برنده شد!' : '🏆 تیم قرمز برنده شد!';
    return `${head}\n\n${teams}\n\n🏁 بازی تموم شد\n🔵 آبی: ${t.blue}\n🔴 قرمز: ${t.red}\n\n${w}`;
  }
  if (r.phase === 'waiting') {
    return `${head}\n\n${teams}\n\n🎮 بازی شروع شد! روی «ورود به بازی» بزن. کلمه اول چند ثانیه دیگه میاد.`;
  }
  return `${head}\n\n${teams}\n\n🎮 بازی در حال انجامه. اگه وارد نشدی، روی «ورود به بازی» بزن.`;
}

function lobbyKeyboard(r) {
  if (r.phase === 'lobby') {
    return [
      [
        { text: '🔵 تیم آبی', callback_data: 'team:blue' },
        { text: '🔴 تیم قرمز', callback_data: 'team:red' },
      ],
      [{ text: '▶️ شروع بازی (میزبان)', callback_data: 'start' }],
    ];
  }
  if (r.phase === 'done') return [];
  return [[{ text: '🎮 ورود به بازی', url: `https://t.me/${botUsername}/${APP_NAME}?startapp=${r.id}` }]];
}

function scheduleLobbyUpdate(r) {
  if (!bot || !r.inlineMsgId || r.updTimer) return;
  r.updTimer = setTimeout(async () => {
    r.updTimer = null;
    const text = lobbyText(r);
    if (text === r.lastText) return;
    r.lastText = text;
    const kb = lobbyKeyboard(r);
    try {
      await bot.telegram.editMessageText(undefined, undefined, r.inlineMsgId, text, {
        reply_markup: { inline_keyboard: kb },
      });
    } catch (e) {
      console.log('edit failed:', e.message);
    }
  }, 700);
}

const pushState = (r) => {
