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
    phase: 'lobby', // lobby | round | reveal | done
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

// ---------- the game message inside the Telegram group ----------
function lobbyText(r) {
  const names = (t) =>
    [...r.players.values()].filter((p) => p.team === t).map((p) => p.name).join('، ') || '—';
  const head = `🎯 بازی حدس کلمه (${LEVELS[r.level]})\n👑 میزبان: ${r.hostName}`;
  if (r.phase === 'lobby') {
    return `${head}\n\n🔵 تیم آبی: ${names('blue')}\n🔴 تیم قرمز: ${names('red')}\n\nروی دکمه بزنید، تیم انتخاب کنید و منتظر شروع توسط میزبان باشید.`;
  }
  if (r.phase === 'done') {
    const t = totals(r);
    const w = t.blue === t.red ? '🤝 مساوی شد!' : t.blue > t.red ? '🏆 تیم آبی برنده شد!' : '🏆 تیم قرمز برنده شد!';
    return `${head}\n\n🏁 بازی تموم شد\n🔵 آبی: ${t.blue}\n🔴 قرمز: ${t.red}\n\n${w}`;
  }
  return `${head}\n\n🎮 بازی در حال انجامه…`;
}

function scheduleLobbyUpdate(r) {
  if (!bot || !r.inlineMsgId || r.updTimer) return;
  r.updTimer = setTimeout(async () => {
    r.updTimer = null;
    const text = lobbyText(r);
    if (text === r.lastText) return;
    r.lastText = text;
    const kb =
      r.phase === 'done'
        ? []
        : [[{ text: '🎮 ورود به بازی', url: `https://t.me/${botUsername}/${APP_NAME}?startapp=${r.id}` }]];
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
  broadcast(r, snapshot(r));
  scheduleLobbyUpdate(r);
};

// ---------- game flow ----------
function startGame(r) {
  r.used.clear();
  r.round = 0;
  r.players.forEach((p) => (p.score = 0));
  nextRound(r);
}

function nextRound(r) {
  r.round++;
  const pool = wordsFor(r.level).filter((w) => !r.used.has(w));
  const w = pool[Math.floor(Math.random() * pool.length)];
  r.used.add(w);
  r.display = w;
  r.word = norm(w);
  r.letters = scramble(w);
  r.phase = 'round';
  r.players.forEach((p) => (p.solved = false));
  r.endsAt = Date.now() + ROUND_MS;
  broadcast(r, { t: 'round', n: r.round, total: ROUNDS, letters: r.letters, ms: ROUND_MS });
  r.timer = setTimeout(() => endRound(r), ROUND_MS);
}

function endRound(r) {
  if (r.phase !== 'round') return;
  clearTimeout(r.timer);
  r.phase = 'reveal';
  broadcast(r, { t: 'reveal', word: r.display });
  pushState(r);
  setTimeout(() => (r.round < ROUNDS ? nextRound(r) : finish(r)), REVEAL_MS);
}

function finish(r) {
  r.phase = 'done';
  const t = totals(r);
  const winner = t.blue === t.red ? 'draw' : t.blue > t.red ? 'blue' : 'red';
  broadcast(r, { t: 'done', totals: t, winner });
  pushState(r);
}

// ---------- web server + websocket ----------
const app = express();
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    if (m.t === 'join') {
      let info = parseInitData(m.initData);
      if (!info && DEV) {
        info = { uid: String(m.uid || ''), name: String(m.name || 'تستی'), room: String(m.room || '') };
      }
      if (!info || !info.uid || !info.room) {
        return send(ws, { t: 'error', msg: 'بازی رو از طریق گروه تلگرام باز کن.' });
      }
      let r = rooms.get(info.room);
      if (!r && DEV) {
        r = createRoom(info.room, { level: 'easy', hostId: info.uid, hostName: info.name });
      }
      if (!r) {
        return send(ws, { t: 'error', msg: 'این بازی پیدا نشد یا تموم شده. یه بازی جدید بساز.' });
      }
      let p = r.players.get(info.uid);
      if (!p) {
        p = { uid: info.uid, name: '', team: null, score: 0, solved: false, ws: null };
        r.players.set(info.uid, p);
      }
      p.name = info.name.slice(0, 30);
      p.ws = ws;
      ws.ctx = { r, p };
      send(ws, { t: 'hello', uid: info.uid });
      pushState(r);
      if (r.phase === 'round') {
        send(ws, {
          t: 'round',
          n: r.round,
          total: ROUNDS,
          letters: r.letters,
          ms: Math.max(0, r.endsAt - Date.now()),
        });
      }
      return;
    }

    if (!ws.ctx) return;
    const { r, p } = ws.ctx;

    if (m.t === 'team' && r.phase === 'lobby' && (m.team === 'blue' || m.team === 'red')) {
      p.team = m.team;
      pushState(r);
    } else if (m.t === 'start' && p.uid === r.hostId && r.phase === 'lobby') {
      const online = [...r.players.values()].filter((x) => x.team && x.ws);
      const blue = online.filter((x) => x.team === 'blue').length;
      const red = online.filter((x) => x.team === 'red').length;
      if (blue < 1 || red < 1) {
        send(ws, { t: 'notice', msg: 'تا یه نفر دیگه عضو نشه نمی‌تونی شروع کنی. توی هر تیم باید حداقل یه نفر باشه.' });
      } else {
        startGame(r);
      }
    } else if (m.t === 'again' && p.uid === r.hostId && r.phase === 'done') {
      r.phase = 'lobby';
      r.players.forEach((x) => (x.score = 0));
      pushState(r);
    } else if (m.t === 'guess' && r.phase === 'round' && p.team && !p.solved) {
      if (norm(m.text) === r.word) {
        const remaining = Math.max(0, r.endsAt - Date.now());
        const pts = Math.max(10, Math.round((100 * remaining) / ROUND_MS));
        p.score += pts;
        p.solved = true;
        send(ws, { t: 'correct', pts });
        const active = [...r.players.values()].filter((x) => x.team && x.ws);
        if (active.every((x) => x.solved)) endRound(r);
      } else {
        send(ws, { t: 'wrong' });
      }
    }
  });

  ws.on('close', () => {
    if (!ws.ctx) return;
    const { r, p } = ws.ctx;
    if (p.ws === ws) p.ws = null;
    pushState(r);
  });
});

server.listen(PORT, () => console.log('Server on port ' + PORT));

// forget games older than 6 hours
setInterval(() => {
  const now = Date.now();
  rooms.forEach((r, id) => {
    if (now - r.createdAt > 6 * 3600 * 1000 && r.phase !== 'round') rooms.delete(id);
  });
}, 30 * 60 * 1000);

// ---------- telegram bot ----------
if (!BOT_TOKEN) {
  console.log('BOT_TOKEN missing: bot not started (web server only).');
} else {
  bot = new Telegraf(BOT_TOKEN);

  bot.start((ctx) =>
    ctx.reply(`برای بازی، توی گروه بنویس @${botUsername} و روی «حدس کلمه» بزن.`)
  );

  // typing @botname in a group shows the game as the first suggestion
  bot.on('inline_query', (ctx) =>
    ctx.answerInlineQuery(
      [
        {
          type: 'article',
          id: 'wordgame',
          title: '🎯 حدس کلمه',
          description: 'بازی گروهی حدس کلمه، تیم آبی در برابر تیم قرمز',
          input_message_content: { message_text: '🎯 بازی حدس کلمه\n\nسطح بازی رو انتخاب کن:' },
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'آسان', callback_data: 'lvl:easy' },
                { text: 'متوسط', callback_data: 'lvl:medium' },
                { text: 'سخت', callback_data: 'lvl:hard' },
              ],
            ],
          },
        },
      ],
      { cache_time: 0, is_personal: true }
    )
  );

  // needs "inline feedback" enabled in BotFather; tells us who created the game
  bot.on('chosen_inline_result', (ctx) => {
    const res = ctx.chosenInlineResult;
    if (res.inline_message_id) pendingOwner.set(res.inline_message_id, String(res.from.id));
  });

  bot.action(/^lvl:(easy|medium|hard)$/, async (ctx) => {
    const cq = ctx.callbackQuery;
    const imid = cq.inline_message_id;
    if (!imid) return ctx.answerCbQuery();
    const owner = pendingOwner.get(imid);
    if (owner && owner !== String(cq.from.id)) {
      return ctx.answerCbQuery('فقط کسی که بازی رو ساخته می‌تونه سطح رو انتخاب کنه.', { show_alert: true });
    }
    if (inlineRooms.has(imid)) return ctx.answerCbQuery();
    const id = crypto.randomBytes(5).toString('hex');
    const hostName = [cq.from.first_name, cq.from.last_name].filter(Boolean).join(' ') || 'ناشناس';
    const r = createRoom(id, {
      level: ctx.match[1],
      hostId: String(cq.from.id),
      hostName,
      inlineMsgId: imid,
    });
    inlineRooms.set(imid, id);
    await ctx.answerCbQuery();
    scheduleLobbyUpdate(r);
  });

  (async () => {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
    console.log('Bot started as @' + botUsername);
    bot.launch().catch((e) => console.error('Bot error:', e));
  })();
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
