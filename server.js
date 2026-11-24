const http = require('http');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

const ROUNDS = 5;
const ROUND_TIMES = { easy: 14000, medium: 17000, hard: 21000 }; // time for one word, by level
const roundMs = (r) => ROUND_TIMES[r.level];
// points for a correct answer, by the real answer time in whole seconds:
// full points up to the end of second `fullUntil`, then `penalty` points less for every further second
const SCORING = {
  easy: { full: 20, fullUntil: 5, penalty: 2 },
  medium: { full: 24, fullUntil: 6, penalty: 2 },
  hard: { full: 28, fullUntil: 8, penalty: 2 },
};
function pointsFor(r) {
  const { full, fullUntil, penalty } = SCORING[r.level];
  const elapsed = roundMs(r) - (r.endsAt - Date.now()); // real time since the word appeared
  const second = Math.max(1, Math.ceil(elapsed / 1000)); // 1 = the first second
  return Math.max(0, full - penalty * Math.max(0, second - fullUntil));
}
const REVEAL_MS = 3000;
const START_MS = 3000;
const LEVELS = { easy: 'آسان', medium: 'متوسط', hard: 'سخت' };
const SIGNATURE = '✦ Nimkat ✦'; // shown on every game message, so everybody knows who made the game
const LEVEL_DESC = {
  easy: 'کلمه‌های ۴ حرفی',
  medium: 'کلمه‌های ۵ حرفی',
  hard: 'کلمه‌های ۶ حرفی',
};
const LEADERBOARD_TTL = 8 * 3600 * 1000; // 8 hours

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
  'مجله', 'آگهی', 'نقشه', 'شیمی', 'زیست', 'انشا', 'الاغ', 'لاما',
  'توله', 'زالو', 'کبرا', 'میگو', 'کرکس', 'قمری', 'سهره', 'هدهد',
  'قیمه', 'حلیم', 'املت', 'کتلت', 'دلمه', 'خامه', 'مربا', 'کرفس',
  'شلغم', 'تمشک', 'تخمه', 'شربت', 'اتاق', 'حمام', 'سالن', 'قوری',
  'تابه', 'کاسه', 'لباس', 'دامن', 'افسر', 'قاضی', 'وکیل', 'رقاص',
  'عطار', 'کفاش', 'بیشه', 'مرتع', 'خلیج', 'صخره', 'ماسه', 'چانه',
  'بازو', 'تمیز', 'کثیف', 'روشن', 'محبت', 'نشاط', 'سکوت', 'عروس',
  'رفیق', 'آشنا', 'دریل', 'مهره', 'آچار', 'طناب', 'تنبک', 'آهنگ',
  'نغمه', 'جودو', 'مریخ', 'ماوس', 'سایت', 'مشهد', 'ساری', 'اراک',
  'عراق', 'ژاپن', 'نروژ', 'هلند', 'کالا', 'هدیه', 'بندر', 'خیال',
  'ساقه', 'غنچه', 'نهال', 'سفره', 'لقمه', 'تشنه', 'خواب', 'تلاش',
  'شرکت', 'حقوق', 'منشی', 'گیاه', 'خرمن', 'خوشه', 'سبزه', 'بوته',
  'قنات', 'قطره', 'بخار', 'بارش', 'شعله', 'زغال', 'هیزم', 'مشعل',
  'شیشه', 'کتان', 'ایده', 'کوشش', 'بخشش', 'گذشت', 'سفال', 'گلیم',
  'واژه', 'نقطه', 'لنگر', 'عرشه', 'پارو', 'طعمه', 'مقصد', 'مبدا',
  'ویزا', 'گردش', 'عطسه', 'باند', 'بخیه', 'نسخه', 'سرور', 'فایل',
  'پوشه', 'ورزش', 'مربع', 'مثلث', 'مکعب', 'محیط', 'درصد', 'شمال',
  'جنوب', 'راست', 'بالا', 'کنار', 'کوله', 'جعبه', 'بسته', 'پاکت',
  'تمبر', 'امضا', 'مدرک', 'ریال', 'دلار', 'یورو', 'شاهد', 'گواه',
  'سمنو', 'سنبل', 'آجیل', 'قلمو', 'کوزه', 'خمره', 'حصیر', 'دوخت',
  'حشره', 'شجاع', 'ترسو', 'تنبل', 'کوشا', 'آرام', 'ساکت', 'سالم',
  'لاغر', 'ضعیف', 'دانا', 'هرگز', 'معنی', 'پاسخ', 'پرسش', 'سوال',
  'جواب', 'دلیل', 'سفیر', 'دبیر', 'ناظر', 'آزاد', 'آغاز', 'آگاه',
  'آواز', 'ارزش', 'بانو', 'بلوط', 'بنده', 'بهتر', 'بهره', 'پهلو',
  'پیرو', 'تمام', 'تنفس', 'توان', 'توجه', 'تیره', 'ثروت', 'جلسه',
  'جهان', 'جوهر', 'چهره', 'حرکت', 'حمله', 'خروج', 'خلاق', 'دقیق',
  'دنیا', 'درون', 'رایج', 'راحت', 'روان', 'ژاکت', 'ستون', 'سرعت',
  'شانس', 'شروع', 'شفاف', 'شگفت', 'صاحب', 'صحنه', 'صحبت', 'صنعت',
  'طراح', 'عادت', 'عالم', 'عرصه', 'عزیز', 'عمیق', 'غایب', 'فرصت',
  'فشار', 'فعال', 'قدرت', 'قدیم', 'قرار', 'کامل', 'گروه', 'گوشه',
  'لازم', 'مثال', 'مردم', 'مشکل', 'موفق', 'نخست', 'نژاد', 'نگاه',
  'نیاز', 'نیرو', 'نیمه', 'یقین', 'یاری', 'بطری', 'چیپس', 'معما',
  'سعدی', 'حافظ', 'خیام', 'رستم', 'ضحاک', 'کلبه', 'چادر', 'خیمه',
  'نرده', 'خلال', 'لولا',
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
  'فیزیک', 'دیکته', 'هندسه', 'گوریل', 'کوالا', 'پاندا', 'حلزون', 'طاووس',
  'چکاوک', 'پرستو', 'فاخته', 'قورمه', 'سوسیس', 'ترخون', 'چغندر', 'باقلا',
  'آلوچه', 'شاتوت', 'توالت', 'فریزر', 'مانتو', 'روسری', 'کتانی', 'پوتین',
  'معمار', 'چوپان', 'باریک', 'تاریک', 'اندوه', 'فریاد', 'گذشته', 'داماد',
  'غریبه', 'نوزاد', 'زنجیر', 'سنجاق', 'ترانه', 'مشتری', 'عطارد', 'ناهید',
  'نپتون', 'سیارک', 'ایمیل', 'شیراز', 'تبریز', 'کرمان', 'اهواز', 'بوشهر',
  'قزوین', 'زنجان', 'سنندج', 'یاسوج', 'ایلام', 'سمنان', 'گرگان', 'ایران',
  'ترکیه', 'روسیه', 'آلمان', 'برزیل', 'یونان', 'بلژیک', 'اتریش', 'مکزیک',
  'جایزه', 'شقایق', 'ناهار', 'خوراک', 'گرسنه', 'بیدار', 'اداره', 'راهرو',
  'جوانه', 'محصول', 'کاریز', 'رگبار', 'فولاد', 'پارچه', 'حافظه', 'خاطره',
  'تجربه', 'آموزش', 'پرورش', 'پژوهش', 'مجسمه', 'فارسی', 'ناخدا', 'ملوان',
  'اقامت', 'تفریح', 'سپیده', 'ویروس', 'واکسن', 'پیامک', 'تمرین', 'دویدن',
  'پریدن', 'دایره', 'زاویه', 'تفریق', 'تقسیم', 'فرمول', 'مجموع', 'پایین',
  'خیاطی', 'سمندر', 'خزنده', 'باهوش', 'خندان', 'گریان', 'غمگین', 'بیمار',
  'نادان', 'همیشه', 'اکنون', 'نتیجه', 'مامور', 'آماده', 'اتفاق', 'ادامه',
  'اطلاع', 'افکار', 'امکان', 'انتها', 'انسان', 'انرژی', 'اهمیت', 'برابر',
  'بیرون', 'پایان', 'تازگی', 'تحصیل', 'تصمیم', 'تعداد', 'تفاوت', 'تولید',
  'حادثه', 'حقیقت', 'حکایت', 'حیوان', 'خوشبو', 'دشوار', 'ذخیره', 'رابطه',
  'رفتار', 'شرایط', 'طبیعت', 'علاقه', 'عنوان', 'فاصله', 'فایده', 'کیفیت',
  'گفتار', 'مرحله', 'مسافت', 'مقدار', 'منطقه', 'موضوع', 'مهارت', 'میراث',
  'نشانه', 'نمونه', 'واقعی', 'وسیله', 'وظیفه', 'هیجان', 'مسواک', 'شامپو',
  'کلوچه', 'سالاد', 'پاستا', 'هفتگی', 'آوازه', 'دیوان', 'رباعی', 'قصیده',
  'لطیفه', 'مولوی', 'نظامی', 'سهراب', 'جمشید', 'کیوان', 'پیاده', 'سواره',
  'شبانه', 'عروسک', 'پرچین', 'کاغذی', 'ملافه',
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
  'دارکوب', 'کوبیده', 'کالباس', 'زنجبیل', 'نوشابه', 'کاناپه', 'استکان', 'کراوات',
  'کمربند', 'جوشکار', 'شکارچی', 'باتلاق', 'یکشنبه', 'دوشنبه',
  'خوشمزه', 'میزبان', 'نردبان', 'کاراته', 'اصفهان', 'زاهدان', 'ارومیه', 'بجنورد',
  'بیرجند', 'فرانسه', 'انگلیس', 'آمریکا', 'کانادا', 'لهستان', 'صبحانه', 'کارگاه',
  'انباری', 'خاکستر', 'یادگار', 'پیشرفت', 'موفقیت', 'پشتکار', 'معماری', 'باستان',
  'ایرانی', 'کتابچه', 'بادبان', 'مسافرت', 'گردشگر', 'میکروب', 'مرورگر', 'مستطیل',
  'معادله', 'راستگو', 'دروغگو', 'خشمگین', 'سرپرست', 'اشتباه', 'انتخاب', 'سازمان',
  'سرزمین', 'فراوان', 'گسترده', 'مجموعه', 'خوشبخت', 'ناامید', 'نادرست', 'سرگرمی',
  'نگارگر', 'دانشور', 'خاطرات', 'تنهایی', 'دانایی', 'سرخوشی', 'زیبایی', 'دفترچه',
  'سربازی', 'کودکان', 'بیکاری', 'بیداری', 'باهوشی', 'بهاران', 'پاییزی', 'آهنگری',
  'دستمال', 'دستگاه', 'گلستان', 'بوستان', 'شبستان', 'آسمانی', 'ماهانه', 'سالانه',
  'روزانه', 'اتوبان', 'سنگفرش', 'چیستان', 'فردوسی', 'فریدون', 'بالگرد', 'بازیچه',
  'بادکنک', 'کاروان', 'شمعدان', 'آتشدان', 'چراغان',
];
// easy: exactly 4 letters, medium: exactly 5 letters, hard: exactly 6 letters
const LEVEL_LENGTH = { easy: 4, medium: 5, hard: 6 };
const wordsFor = (level) => WORDS.filter((w) => [...w].length === LEVEL_LENGTH[level]);
const recentWords = { easy: [], medium: [], hard: [] }; // newest words used in any game, so they are not repeated soon

const rooms = new Map(); // roomId -> room (one per game message, so groups never mix)
const inlineRooms = new Map(); // inline_message_id -> roomId
const leaderboards = new Map(); // chatKey -> { updatedAt, players: Map<uid, {name, score, games}> }
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
  // strip HTML tags before counting so bold text stays centred
  const visible = s.replace(/<[^>]+>/g, '');
  const side = Math.max(0, Math.floor((TARGET_WIDTH - [...visible].length) / 2));
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
    chatKey: init.chatKey || null, // stable identifier for the chat (chat_instance)
    players: new Map(),
    phase: 'lobby', // lobby | starting | round | reveal | done | leaderboard
    prevPhase: null, // remembered when we switch to leaderboard, so BACK restores it
    round: 0,
    word: '',
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

// ---------- leaderboard ----------
function updateLeaderboard(r) {
  if (!r.chatKey) return;
  let lb = leaderboards.get(r.chatKey);
  if (!lb) {
    lb = { updatedAt: Date.now(), players: new Map() };
    leaderboards.set(r.chatKey, lb);
  }
  lb.updatedAt = Date.now();
  for (const p of members(r)) {
    let e = lb.players.get(p.uid);
    if (!e) {
      e = { name: p.name, score: 0, games: 0 };
      lb.players.set(p.uid, e);
    }
    e.name = p.name;
    e.score += p.score;
    e.games += 1;
  }
}

function leaderboardRows(chatKey) {
  const lb = leaderboards.get(chatKey);
  if (!lb || lb.players.size === 0) return null;
  return [...lb.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((e, i) => {
      const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
      return center(`${medal}${i + 1}. ${e.name} — ${e.score} (${e.games} بازی)`);
    })
    .join('\n');
}

// ---------- the game message (edited in place) ----------
function roomBody(r) {
  const list = (t) => {
    const ps = [...r.players.values()].filter((p) => p.team === t);
    if (!ps.length) return center('<b>   (خالی)</b>');
    return ps.map((p) => center(`<b>   • ${p.name}</b>`)).join('\n');
  };
  const head = center(`🎯 بازی حدس کلمه (${LEVELS[r.level]})`);
  const sep = center('━━━━━━━━━━━━━━');
  const teams = `${sep}\n${center('<b>🔵 تیم آبی</b>')}\n${list('blue')}\n${sep}\n${center('<b>🔴 تیم قرمز</b>')}\n${list('red')}\n${sep}`;
  if (r.phase === 'lobby') return `${head}\n${center(`👑 میزبان: ${r.hostName}`)}\n\n${teams}`;
  if (r.phase === 'starting') return `${head}\n\n${teams}\n\n${center('🎮 بازی شروع شد! آماده باش…')}`;
  if (r.phase === 'round') {
    const s = Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000));
    const t = totals(r);
    return `${head}\n${center(`کلمه ${r.round} از ${ROUNDS}  ⏱ ${s}`)}\n\n${center(`🔵 تیم آبی: ${t.blue}`)}\n${center(`🔴 تیم قرمز: ${t.red}`)}`;
  }
  if (r.phase === 'reveal') {
    return `${head}\n${center(`کلمه ${r.round} از ${ROUNDS}`)}\n\n${center('⏳ مرحله تموم شد')}`;
  }
  if (r.phase === 'leaderboard') {
    const rows = leaderboardRows(r.chatKey);
    if (!rows) return `${head}\n\n${center('🏆 جدول امتیازات گروه')}\n\n${center('هنوز امتیازی ثبت نشده.')}`;
    return `${head}\n\n${center('🏆 جدول امتیازات گروه')}\n\n${rows}`;
  }
  // done
  const t = totals(r);
  const winner = t.blue === t.red ? '🤝 مساوی شد!' : t.blue > t.red ? '🏆 تیم آبی برنده شد!' : '🏆 تیم قرمز برنده شد!';
  const board = members(r)
    .sort((a, b) => b.score - a.score)
    .map((p, i) => {
      const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
      return center(`${medal}${i + 1}. ${p.team === 'blue' ? '🔵' : '🔴'} ${p.name} — ${p.score}`);
    })
    .join('\n');
  return (
    `${head}\n\n${center('🏁 بازی تموم شد')}\n${center(`🔵 آبی: ${t.blue}`)}\n${center(`🔴 قرمز: ${t.red}`)}` +
    `\n\n${center(winner)}\n\n${board}`
  );
}

const roomText = (r) => `${roomBody(r)}\n\n${center(SIGNATURE)}`;

const lobbyButtons = (level) => [
  [
    { text: '🔵 تیم آبی', callback_data: `T:blue:${level}` },
    { text: '🔴 تیم قرمز', callback_data: `T:red:${level}` },
  ],
  [{ text: '▶️ شروع بازی', callback_data: `S:${level}` }],
];

// how many letter buttons per row, for words of 4, 5 and 6 letters
const TILE_ROWS = { 4: [4], 5: [3, 2], 6: [3, 3] };

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
  if (r.phase === 'done') {
    return [
      [
        { text: '🏆 جدول امتیازات گروه', callback_data: 'LB' },
        { text: '🔄 بازی دوباره', switch_inline_query_current_chat: '' },
      ],
    ];
  }
  if (r.phase === 'leaderboard') return [[{ text: '🔙 برگشت به نتیجه', callback_data: 'BACK' }]];
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
          parse_mode: 'HTML',
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
  r.word = norm(w);
  r.tiles = scramble(w);
  r.players.forEach((p) => {
    p.solved = false;
    p.sel = [];
  });
  r.phase = 'round';
  const ms = roundMs(r);
  r.endsAt = Date.now() + ms; // one deadline for everyone, kept by the server
  scheduleUpdate(r, 0);
  r.midTimer = setTimeout(() => scheduleUpdate(r, 0), Math.floor(ms / 2)); // countdown refreshed once, halfway
  r.timer = setTimeout(() => endRound(r), ms);
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
  updateLeaderboard(r); // add this game's scores to the group's leaderboard
  scheduleUpdate(r, 0);
}

// cleanup: forget old games (6h) and old leaderboards (8h)
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
  leaderboards.forEach((lb, key) => {
    if (now - lb.updatedAt > LEADERBOARD_TTL) leaderboards.delete(key);
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
    ctx.reply(`برای بازی، توی گروه بنویس @${botUsername} و سطح بازی رو انتخاب کن.\n\n${SIGNATURE}`)
  );

  // typing @botname in a group lists the three levels
  bot.on('inline_query', (ctx) =>
    ctx.answerInlineQuery(
      Object.keys(LEVELS).map((lvl) => ({
        type: 'article',
        id: 'lvl-' + lvl,
        title: LEVELS[lvl],
        description: `${LEVEL_DESC[lvl]}  •  Nimkat`,
        input_message_content: { message_text: `🎯 بازی حدس کلمه (${LEVELS[lvl]})\n\n${center(SIGNATURE)}` },
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
    if (!r.chatKey && cq.chat_instance) r.chatKey = cq.chat_instance;
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
    if (!r.chatKey && cq.chat_instance) r.chatKey = cq.chat_instance;
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
      const pts = pointsFor(r);
      p.score += pts;
      p.solved = true;
      if (members(r).every((x) => x.solved)) endRound(r);
      return answer(ctx, `✅ +${pts}`);
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

  // show the group's leaderboard inside the same inline message
  bot.action('LB', (ctx) => {
    const cq = ctx.callbackQuery;
    const r = roomOf(cq);
    if (!r) return answer(ctx, 'بازی پیدا نشد.', true);
    if (!r.chatKey) return answer(ctx, 'هنوز امتیازی ثبت نشده.', true);
    const rows = leaderboardRows(r.chatKey);
    if (!rows) return answer(ctx, 'هنوز امتیازی ثبت نشده.', true);
    r.prevPhase = r.phase;
    r.phase = 'leaderboard';
    scheduleUpdate(r, 0);
    return answer(ctx, '🏆');
  });

  // go back from the leaderboard to the result screen
  bot.action('BACK', (ctx) => {
    const cq = ctx.callbackQuery;
    const r = roomOf(cq);
    if (!r) return answer(ctx);
    r.phase = r.prevPhase || 'done';
    r.prevPhase = null;
    scheduleUpdate(r, 0);
    return answer(ctx, '🔙');
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
