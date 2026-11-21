const http = require('http');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

const ROUNDS = 5;
const ROUND_MS = 10000;
const MID_MS = 5000; // the countdown in the message is refreshed once, halfway
const REVEAL_MS = 3000;
const START_MS = 3000;
const LEVELS = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
const LEVEL_DESC = {
  easy: 'کلمه‌های ۴ حرفی',
  medium: 'کلمه‌های ۵ حرفی',
  hard: 'کلمه‌های ۶ حرفی',
};

const WORDS = [
  // 4 letters (easy)
  'کتاب', 'مداد', 'دریا', 'کلاس', 'انار', 'ماهی', 'درخت', 'تلفن',
  'چراغ', 'ساعت', 'خانه', 'میوه', 'آینه', 'قاشق', 'بالش', 'گربه',
  'پلنگ', 'کفتر', 'جوجه', 'عقاب', 'طوطی', 'کوسه', 'زمین', 'نقره',
  'گلاب', 'لاله', 'نرگس', 'سوسن', 'ریشه', 'شاخه', 'لیمو', 'خیار',
  'هویج', 'پیاز', 'فلفل', 'قهوه', 'پنیر', 'ماست', 'برنج', 'نخود',
  'گندم', 'کباب', 'خورش', 'حلوا', 'پرده', 'لامپ', 'کلید', 'چاقو',
  'کتری', 'اجاق', 'جارو', 'حوله', 'شانه', 'عینک', 'کلاه', 'سوزن',
  'قیچی', 'دفتر', 'نامه', 'کاغذ', 'تخته', 'دکمه', 'کوچه', 'پارک',
  'جنگل', 'ساحل', 'صحرا', 'جاده', 'مسجد', 'موزه', 'بینی', 'دهان',
  'زبان', 'گردن', 'سینه', 'زانو', 'ناخن', 'صورت', 'ابرو', 'گونه',
  'پوست', 'معلم', 'دکتر', 'پزشک', 'نجار', 'قصاب', 'بقال', 'خیاط',
  'پلیس', 'شاعر', 'نقاش', 'مادر', 'دوست', 'همسر', 'دایی', 'خاله',
  'دشمن', 'کودک', 'جوان', 'هفته', 'بهار', 'فردا', 'لحظه', 'سفید',
  'سیاه', 'قرمز', 'بنفش', 'تنیس', 'کشتی', 'بوکس', 'مربی', 'بازی',
  'مدال', 'گوزن', 'نهنگ', 'اردک', 'کلاغ', 'بلبل', 'عقرب', 'بانک',
  'قیمت', 'خرید', 'فروش', 'امید', 'آرزو', 'رویا', 'شادی', 'خنده',
  'گریه', 'دانش', 'رمان', 'قطار', 'قایق', 'مترو', 'ربات', 'پیام',
  'فیلم', 'صفحه', 'پسته', 'فندق', 'گردو', 'کشمش', 'خرما', 'انبه',
  'پرچم', 'کمان', 'بلیط', 'حیاط', 'بهشت', 'دوزخ', 'ماسک', 'ملکه',
  'مدیر', 'قلعه', 'خنجر', 'تنگه', 'زمرد', 'عقیق', 'شبنم', 'غروب',
  'واحه', 'کویر', 'چشمه', 'نسیم', 'تگرگ', 'سرما', 'گرما', 'شتاب',
  'زرشک', 'شلیل', 'کیوی', 'کاهو', 'گوجه', 'قارچ', 'شوید', 'کوکو',
  'کولر', 'پنکه', 'سینی', 'پارچ', 'موکت', 'قالی', 'لحاف', 'قفسه',
  'نمره', 'کلیه', 'معده', 'روده', 'سبیل', 'آرنج', 'پگاه', 'بهمن',
  'آبان', 'خروس', 'سوسک', 'افعی', 'خفاش', 'شغال', 'گراز', 'سمور',
  'پازل', 'شکست', 'داور', 'موشک', 'راکت', 'شبکه', 'حساب', 'تولد',
  'عیدی', 'یلدا', 'شنبه', 'جمعه', 'آشپز', 'بزرگ', 'کوچک', 'بلند',
  'تازه', 'کهنه', 'سریع', 'ساده', 'آسان', 'خسته', 'تنها', 'جدید',
  'مجله', 'آگهی', 'نقشه', 'شیمی', 'زیست', 'انشا',
  // 5 letters (medium)
  'پنجره', 'گلدان', 'ستاره', 'پرنده', 'مسافر', 'کبوتر', 'آسمان', 'باغچه',
  'بازار', 'مدرسه', 'نقاشی', 'پاییز', 'شکلات', 'ماشین', 'روباه', 'زرافه',
  'میمون', 'بنفشه', 'گیلاس', 'انجیر', 'انگور', 'گلابی', 'لوبیا', 'بستنی',
  'باران', 'صندلی', 'دیوار', 'چنگال', 'بشقاب', 'لیوان', 'فنجان', 'سماور',
  'یخچال', 'صابون', 'جوراب', 'شلوار', 'روستا', 'دهکده', 'جزیره', 'کلیسا',
  'سینما', 'دندان', 'انگشت', 'مهندس', 'آهنگر', 'نانوا', 'خلبان', 'سرباز',
  'برادر', 'خواهر', 'مهمان', 'امروز', 'دیروز', 'دقیقه', 'ثانیه', 'صورتی',
  'طلایی', 'سیاره', 'صاعقه', 'طوفان', 'زلزله', 'خرگوش', 'سنجاب', 'مورچه',
  'زنبور', 'دلفین', 'خرچنگ', 'گنجشک', 'قناری', 'شاهین', 'تجارت', 'مغازه',
  'فرهنگ', 'تاریخ', 'ماجرا', 'آزادی', 'عدالت', 'تاکسی', 'موتور', 'موزیک',
  'بادام', 'مرداد', 'پیمان', 'شمشیر', 'چمدان', 'ایوان', 'تابلو', 'گیتار',
  'پیانو', 'ویولن', 'سنتور', 'تنبور', 'فرشته', 'دستکش', 'ترازو', 'اسپند',
  'پیرزن', 'الماس', 'یاقوت', 'مهتاب', 'آفتاب', 'دامنه', 'آبشار', 'مرداب',
  'تالاب', 'گرداب', 'بهاری', 'استان', 'میدان', 'کارگر', 'پرواز', 'فرزند',
  'پیتزا', 'ادویه', 'جعفری', 'ریحان', 'نعناع', 'تربچه', 'زیتون', 'خربزه',
  'طالبی', 'ازگیل', 'بخاری', 'توستر', 'ملاقه', 'کفگیر', 'قندان', 'بالشت',
  'ملحفه', 'لوستر', 'استاد', 'شاگرد', 'تکلیف', 'جمجمه', 'حنجره', 'شقیقه',
  'پاشنه', 'اسفند', 'خرداد', 'کرگدن', 'تمساح', 'مرجان', 'شاپرک', 'کفتار',
  'شطرنج', 'تساوی', 'درمان', 'پزشکی', 'جراحی', 'آمپول', 'چاپگر', 'اسکنر',
  'شارژر', 'باتری', 'کاربر', 'آرامش', 'آسایش', 'دوستی', 'دشمنی', 'راستی',
  'صداقت', 'شجاعت', 'زندگی', 'عروسی', 'نوروز', 'آدینه', 'شیرین', 'کوتاه',
  'سنگین', 'آهسته', 'شاداب', 'قدیمی', 'اسباب', 'گزارش', 'تبلیغ', 'ریاضی',
  'فیزیک', 'دیکته', 'هندسه',
  // 6 letters (hard)
  'خورشید', 'شیرینی', 'موسیقی', 'دوچرخه', 'زمستان', 'خیابان', 'آلبالو', 'پیراهن',
  'موبایل', 'قابلمه', 'خودکار', 'دریاچه', 'پیشانی', 'بازیگر', 'راننده', 'کشاورز',
  'همسایه', 'نارنجی', 'کهکشان', 'فوتبال', 'دروازه', 'مسابقه', 'قهرمان', 'لاکپشت',
  'پروانه', 'پنگوئن', 'شترمرغ', 'داستان', 'افسانه', 'اتوبوس', 'کامیون', 'ترافیک',
  'برنامه', 'تلگرام', 'آناناس', 'نارگیل', 'شهریور', 'مهرگان', 'دمپایی', 'پرتقال',
  'نارنگی', 'باغبان', 'پادشاه', 'ابریشم', 'پرستار', 'فیروزه', 'بیابان', 'گردباد',
  'مهمانی', 'دوستان', 'فراموش', 'بازیکن', 'کارمند', 'شهروند', 'پایتخت', 'همبرگر',
  'آبگوشت', 'فسنجان', 'زعفران', 'دارچین', 'اسفناج', 'زردآلو', 'خرمالو', 'نعلبکی',
  'نمکدان', 'آباژور', 'قالیچه', 'دبستان', 'دانشجو', 'امتحان', 'ماهیچه', 'انگشتر',
  'دستبند', 'صبحگاه', 'شامگاه', 'نیمروز', 'بامداد', 'سوسمار', 'بزغاله', 'گوسفند',
  'گوساله', 'مرغابی', 'عنکبوت', 'سنجاقک', 'چلپاسه', 'باشگاه', 'پیروزی', 'پنالتی',
  'بهداشت', 'سلامتی', 'بیماری', 'آزمایش', 'کیبورد', 'دوربین', 'رایانه', 'سرنوشت',
  'اندیشه', 'دلتنگی', 'گلخانه', 'گلفروش', 'خوشحال', 'ناراحت', 'نگهبان', 'ادبیات',
];
// easy: exactly 4 letters, medium: exactly 5 letters, hard: exactly 6 letters
const LEVEL_LENGTH = { easy: 4, medium: 5, hard: 6 };
const wordsFor = (level) => WORDS.filter((w) => [...w].length === LEVEL_LENGTH[level]);
const recentWords = { easy: [], medium: [], hard: [] }; // newest words used in any game, so they are not repeated soon

const rooms = new Map(); // roomId -> room (one per game message, so groups never mix)
const inlineRooms = new Map(); // inline_message_id -> roomId
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
// an invisible character (not trimmed by Telegram) is used to centre the lines and to widen the message;
// if the message looks too wide or too narrow, change TARGET_WIDTH
const PAD = '\u2800';
const TARGET_WIDTH = 34;
const center = (s) => {
  const side = Math.max(0, Math.floor((TARGET_WIDTH - [...s].length) / 2));
  return PAD.repeat(side) + s + PAD.repeat(side);
};
const fullName = (from) =>
  ([from.first_name, from.last_name].filter(Boolean).join(' ') || 'ناشناس').slice(0, 30);

function createRoom(init) {
  const r = {
    id: crypto.randomBytes(5).toString('hex'),
    level: init.level,
    hostId: init.hostId,
    hostName: init.hostName,
    inlineMsgId: init.inlineMsgId,
    players: new Map(),
    phase: 'lobby', // lobby | starting | round | reveal | done
    round: 0,
    word: '',
    display: '',
    tiles: [],
    used: new Set(),
    timer: null,
    midTimer: null,
    endsAt: 0,
    createdAt: Date.now(),
    updTimer: null,
    lastKey: '',
    chain: Promise.resolve(),
  };
  rooms.set(r.id, r);
  inlineRooms.set(r.inlineMsgId, r.id);
  return r;
}

function getOrCreateRoom(imid, level, from) {
  const rid = inlineRooms.get(imid);
  let r = rid && rooms.get(rid);
  if (!r) {
    r = createRoom({ level, hostId: String(from.id), hostName: fullName(from), inlineMsgId: imid });
    scheduleUpdate(r, 0);
  }
  return r;
}

const roomOf = (cq) => {
  const rid = inlineRooms.get(cq.inline_message_id);
  return rid ? rooms.get(rid) : null;
};

function getPlayer(r, from) {
  const uid = String(from.id);
  let p = r.players.get(uid);
  if (!p) {
    p = { uid, name: '', team: null, score: 0, solved: false, sel: [] };
    r.players.set(uid, p);
  }
  p.name = fullName(from);
  return p;
}

const members = (r) => [...r.players.values()].filter((p) => p.team);
const totals = (r) => {
  const t = { blue: 0, red: 0 };
  members(r).forEach((p) => (t[p.team] += p.score));
  return t;
};

// ---------- the game message (edited in place) ----------
function roomText(r) {
  const names = (t) =>
    [...r.players.values()].filter((p) => p.team === t).map((p) => p.name).join('، ') || '—';
  const head = center(`🎯 بازی حدس کلمه (${LEVELS[r.level]})`);
  const teams = `${center(`🔵 تیم آبی: ${names('blue')}`)}\n${center(`🔴 تیم قرمز: ${names('red')}`)}`;
  if (r.phase === 'lobby') return `${head}\n${center(`👑 میزبان: ${r.hostName}`)}\n\n${teams}`;
  if (r.phase === 'starting') return `${head}\n\n${teams}\n\n${center('🎮 بازی شروع شد! آماده باش…')}`;
  if (r.phase === 'round') {
    const s = Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000));
    return `${head}\n${center(`کلمه ${r.round} از ${ROUNDS}  ⏱ ${s}`)}`;
  }
  if (r.phase === 'reveal') {
    return `${head}\n${center(`کلمه ${r.round} از ${ROUNDS}`)}\n\n${center(`جواب: ${r.display}`)}`;
  }
  // done
  const t = totals(r);
  const winner = t.blue === t.red ? '🤝 مساوی شد!' : t.blue > t.red ? '🏆 تیم آبی برنده شد!' : '🏆 تیم قرمز برنده شد!';
  const board = members(r)
    .sort((a, b) => b.score - a.score)
    .map((p, i) => center(`${i + 1}. ${p.team === 'blue' ? '🔵' : '🔴'} ${p.name} — ${p.score}`))
    .join('\n');
  return (
    `${head}\n\n${center('🏁 بازی تموم شد')}\n${center(`🔵 آبی: ${t.blue}`)}\n${center(`🔴 قرمز: ${t.red}`)}` +
    `\n\n${center(winner)}\n\n${board}`
  );
}

const lobbyButtons = (level) => [
  [
    { text: '🔵 تیم آبی', callback_data: `T:blue:${level}` },
    { text: '🔴 تیم قرمز', callback_data: `T:red:${level}` },
  ],
  [{ text: '▶️ شروع بازی', callback_data: `S:${level}` }],
];

// how many letter buttons per row, for words of 4, 5 and 6 letters
const TILE_ROWS = { 4: [2, 2], 5: [3, 2], 6: [3, 3] };

function roomKeyboard(r) {
  if (r.phase === 'lobby') return lobbyButtons(r.level);
  if (r.phase === 'round') {
    const sizes = TILE_ROWS[r.tiles.length] || [4, 4, 4];
    const rows = [];
    let i = 0;
    for (const size of sizes) {
      if (i >= r.tiles.length) break;
      rows.push(
        r.tiles.slice(i, i + size).map((c, k) => ({ text: c, callback_data: `L:${r.round}:${i + k}` }))
      );
      i += size;
    }
    rows.push([{ text: '❌', callback_data: `X:${r.round}` }]);
    return rows;
  }
  return [];
}

// edits are queued so they always go out in order; text and keyboard are read when the edit runs
function scheduleUpdate(r, delay = 400) {
  if (!bot || !r.inlineMsgId) return;
  if (r.updTimer) clearTimeout(r.updTimer);
  r.updTimer = setTimeout(() => {
    r.updTimer = null;
    r.chain = r.chain.then(async () => {
      const text = roomText(r);
      const kb = roomKeyboard(r);
      const key = text + JSON.stringify(kb);
      if (key === r.lastKey) return;
      try {
        await bot.telegram.editMessageText(undefined, undefined, r.inlineMsgId, text, {
          reply_markup: { inline_keyboard: kb },
        });
        r.lastKey = key;
      } catch (e) {
        console.log('edit failed:', e.message);
      }
    });
  }, delay);
}

// ---------- game flow ----------
function startGame(r) {
  if (r.phase !== 'lobby') return;
  r.phase = 'starting'; // teams are locked from this moment
  r.used.clear();
  r.round = 0;
  r.players.forEach((p) => (p.score = 0));
  scheduleUpdate(r, 0);
  r.timer = setTimeout(() => nextRound(r), START_MS);
}

function nextRound(r) {
  r.round++;
  const all = wordsFor(r.level);
  const recent = recentWords[r.level];
  let pool = all.filter((w) => !r.used.has(w) && !recent.includes(w));
  if (!pool.length) pool = all.filter((w) => !r.used.has(w));
  if (!pool.length) {
    r.used.clear();
    pool = all;
  }
  const w = pool[Math.floor(Math.random() * pool.length)];
  r.used.add(w);
  recent.push(w);
  while (recent.length > Math.floor(all.length / 2)) recent.shift();
  r.display = w;
  r.word = norm(w);
  r.tiles = scramble(w);
  r.players.forEach((p) => {
    p.solved = false;
    p.sel = [];
  });
  r.phase = 'round';
  r.endsAt = Date.now() + ROUND_MS; // one deadline for everyone, kept by the server
  scheduleUpdate(r, 0);
  r.midTimer = setTimeout(() => scheduleUpdate(r, 0), MID_MS);
  r.timer = setTimeout(() => endRound(r), ROUND_MS);
}

function endRound(r) {
  if (r.phase !== 'round') return;
  clearTimeout(r.timer);
  clearTimeout(r.midTimer);
  r.phase = 'reveal';
  scheduleUpdate(r, 0);
  r.timer = setTimeout(() => (r.round < ROUNDS ? nextRound(r) : finish(r)), REVEAL_MS);
}

function finish(r) {
  r.phase = 'done';
  scheduleUpdate(r, 0);
}

// forget games older than 6 hours
setInterval(() => {
  const now = Date.now();
  rooms.forEach((r, id) => {
    if (now - r.createdAt > 6 * 3600 * 1000 && r.phase !== 'round') {
      clearTimeout(r.timer);
      clearTimeout(r.midTimer);
      rooms.delete(id);
      inlineRooms.delete(r.inlineMsgId);
    }
  });
}, 30 * 60 * 1000);

// ---------- tiny web server (the hosting service needs an open port) ----------
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  })
  .listen(PORT, () => console.log('Server on port ' + PORT));

// keeps the free Render instance awake, so the bot keeps answering
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {});
  }, 10 * 60 * 1000);
}

// ---------- telegram bot ----------
if (!BOT_TOKEN) {
  console.log('BOT_TOKEN missing: bot not started.');
} else {
  bot = new Telegraf(BOT_TOKEN);
  bot.catch((e) => console.error('bot error:', e));

  const answer = (ctx, text, alert) =>
    Promise.resolve(ctx.answerCbQuery(text, alert ? { show_alert: true } : undefined)).catch(() => {});

  bot.start((ctx) =>
    ctx.reply(`برای بازی، توی گروه بنویس @${botUsername} و سطح بازی رو انتخاب کن.`)
  );

  // typing @botname in a group lists the three levels
  bot.on('inline_query', (ctx) =>
    ctx.answerInlineQuery(
      Object.keys(LEVELS).map((lvl) => ({
        type: 'article',
        id: 'lvl-' + lvl,
        title: LEVELS[lvl],
        description: LEVEL_DESC[lvl],
        input_message_content: { message_text: `🎯 بازی حدس کلمه (${LEVELS[lvl]})` },
        reply_markup: { inline_keyboard: lobbyButtons(lvl) },
      })),
      { cache_time: 0, is_personal: true }
    )
  );

  // needs "inline feedback" enabled in BotFather; the person who sends the game becomes the host
  bot.on('chosen_inline_result', (ctx) => {
    const res = ctx.chosenInlineResult;
    const level = String(res.result_id || '').replace('lvl-', '');
    if (!res.inline_message_id || !LEVELS[level]) return;
    getOrCreateRoom(res.inline_message_id, level, res.from);
  });

  // join / change team (only before the game starts)
  bot.action(/^T:(blue|red):(easy|medium|hard)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    if (!cq.inline_message_id) return answer(ctx);
    const r = getOrCreateRoom(cq.inline_message_id, ctx.match[2], cq.from);
    if (r.phase !== 'lobby') return answer(ctx, 'بازی شروع شده و تیم‌ها قفل شدن.', true);
    const p = getPlayer(r, cq.from);
    p.team = ctx.match[1];
    scheduleUpdate(r);
    return answer(ctx, p.team === 'blue' ? '🔵' : '🔴');
  });

  // start (host only)
  bot.action(/^S:(easy|medium|hard)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    if (!cq.inline_message_id) return answer(ctx);
    const r = getOrCreateRoom(cq.inline_message_id, ctx.match[1], cq.from);
    if (String(cq.from.id) !== r.hostId) return answer(ctx, 'فقط میزبان می‌تونه بازی رو شروع کنه.', true);
    if (r.phase !== 'lobby') return answer(ctx);
    const blue = members(r).filter((p) => p.team === 'blue').length;
    const red = members(r).filter((p) => p.team === 'red').length;
    if (blue < 1 || red < 1) {
      return answer(ctx, 'تا یه نفر دیگه عضو نشه نمی‌تونی شروع کنی. توی هر تیم باید حداقل یه نفر باشه.', true);
    }
    startGame(r);
    return answer(ctx, '▶️');
  });

  // tap a letter
  bot.action(/^L:(\d+):(\d+)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    const r = roomOf(cq);
    if (!r) return answer(ctx, 'این بازی پیدا نشد.', true);
    const rnd = Number(ctx.match[1]);
    const idx = Number(ctx.match[2]);
    if (r.phase !== 'round' || r.round !== rnd || Date.now() >= r.endsAt) return answer(ctx, '⏱');
    const p = r.players.get(String(cq.from.id));
    if (!p || !p.team) return answer(ctx, 'تو عضو این بازی نیستی.', true);
    if (p.solved) return answer(ctx, '✅'); // already scored this word
    if (idx < 0 || idx >= r.tiles.length) return answer(ctx);
    if (p.sel.length >= r.tiles.length) return answer(ctx, '❌'); // wrong answer: clear it first
    if (p.sel.includes(idx)) return answer(ctx, p.sel.map((i) => r.tiles[i]).join(''));
    p.sel.push(idx);
    if (p.sel.length < r.tiles.length) return answer(ctx, p.sel.map((i) => r.tiles[i]).join(''));
    // all letters chosen: check automatically
    if (norm(p.sel.map((i) => r.tiles[i]).join('')) === r.word) {
      const remaining = Math.max(0, r.endsAt - Date.now());
      p.score += Math.max(10, Math.round((100 * remaining) / ROUND_MS));
      p.solved = true;
      if (members(r).every((x) => x.solved)) endRound(r);
      return answer(ctx, '✅');
    }
    return answer(ctx, '❌');
  });

  // clear my letters (does not touch the timer)
  bot.action(/^X:(\d+)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    const r = roomOf(cq);
    if (!r) return answer(ctx);
    const p = r.players.get(String(cq.from.id));
    if (r.phase === 'round' && r.round === Number(ctx.match[1]) && p && p.team && !p.solved) p.sel = [];
    return answer(ctx);
  });

  (async () => {
    const me = await bot.telegram.getMe();
    botUsername = me.username;
    console.log('Bot started as @' + botUsername);
    bot.launch().catch((e) => console.error('Bot error:', e));
  })();
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
             }ctx.chosenInlineResult;
    const level = String(res.result_id || '').replace('lvl-', '');
    if (!res.inline_message_id || !LEVELS[level]) return;
    getOrCreateRoom(res.inline_message_id, level, res.from);
  });

  // join / change team (only before the game starts)
  bot.action(/^T:(blue|red):(easy|medium|hard)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    if (!cq.inline_message_id) return answer(ctx);
    const r = getOrCreateRoom(cq.inline_message_id, ctx.match[2], cq.from);
    if (r.phase !== 'lobby') return answer(ctx, 'بازی شروع شده و تیم‌ها قفل شدن.', true);
    const p = getPlayer(r, cq.from);
    p.team = ctx.match[1];
    scheduleUpdate(r);
    return answer(ctx, p.team === 'blue' ? '🔵' : '🔴');
  });

  // start (host only)
  bot.action(/^S:(easy|medium|hard)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    if (!cq.inline_message_id) return answer(ctx);
    const r = getOrCreateRoom(cq.inline_message_id, ctx.match[1], cq.from);
    if (String(cq.from.id) !== r.hostId) return answer(ctx, 'فقط میزبان می‌تونه بازی رو شروع کنه.', true);
    if (r.phase !== 'lobby') return answer(ctx);
    const blue = members(r).filter((p) => p.team === 'blue').length;
    const red = members(r).filter((p) => p.team === 'red').length;
    if (blue < 1 || red < 1) {
      return answer(ctx, 'تا یه نفر دیگه عضو نشه نمی‌تونی شروع کنی. توی هر تیم باید حداقل یه نفر باشه.', true);
    }
    startGame(r);
    return answer(ctx, '▶️');
  });

  // tap a letter
  bot.action(/^L:(\d+):(\d+)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    const r = roomOf(cq);
    if (!r) return answer(ctx, 'این بازی پیدا نشد.', true);
    const rnd = Number(ctx.match[1]);
    const idx = Number(ctx.match[2]);
    if (r.phase !== 'round' || r.round !== rnd || Date.now() >= r.endsAt) return answer(ctx, '⏱');
    const p = r.players.get(String(cq.from.id));
    if (!p || !p.team) return answer(ctx, 'تو عضو این بازی نیستی.', true);
    if (p.solved) return answer(ctx, '✅'); // already scored this word
    if (idx < 0 || idx >= r.tiles.length) return answer(ctx);
    if (p.sel.length >= r.tiles.length) return answer(ctx, '❌'); // wrong answer: clear it first
    if (p.sel.includes(idx)) return answer(ctx, p.sel.map((i) => r.tiles[i]).join(''));
    p.sel.push(idx);
    if (p.sel.length < r.tiles.length) return answer(ctx, p.sel.map((i) => r.tiles[i]).join(''));
    // all letters chosen: check automatically
    if (norm(p.sel.map((i) => r.tiles[i]).join('')) === r.word) {
      const remaining = Math.max(0, r.endsAt - Date.now());
      p.score += Math.max(10, Math.round((100 * remaining) / ROUND_MS));
      p.solved = true;
      if (members(r).every((x) => x.solved)) endRound(r);
      return answer(ctx, '✅');
    }
    return answer(ctx, '❌');
  });

  // clear my letters (does not touch the timer)
  bot.action(/^X:(\d+)$/, (ctx) => {
    const cq = ctx.callbackQuery;
    const r = roomOf(cq);
    if (!r) return answer(ctx);
    const p = r.players.get(String(cq.from.id));
    if (r.phase === 'round' && r.round === Number(ctx.match[1]) && p && p.team && !p.solved) p.sel = [];
    return answer(ctx);
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
