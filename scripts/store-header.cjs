// App Store «Header» creative asset (5244×2950): brand background, logo, name, tagline and three app screens.
//   node scripts/store-header.cjs   → store-assets/appstore/header-{ar,en}-5244x2950.png
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'); const path = require('path');
const R = (p) => path.join(__dirname, '..', p);
const b64 = (p) => fs.readFileSync(R(p)).toString('base64');
const font = (p) => `url(data:font/woff2;base64,${b64(p)})`;
const svg = (p) => `data:image/svg+xml;base64,${b64(p)}`;
const png = (p) => `data:image/png;base64,${b64(p)}`;
const T = {
  ar: { dir: 'rtl', title: 'القرآن والصلاة في تطبيق واحد', sub: 'مصحف بالرسم العثماني · تلاوات · تفسير · أذان وقبلة · مجالس قرآنية', free: 'مجاني بالكامل · بلا إعلانات' },
  en: { dir: 'ltr', title: 'The Quran and prayer, together', sub: 'Uthmani Mushaf · Recitations · Tafsir · Adhan & Qibla · Quran voice rooms', free: 'Completely free · No ads' },
};
(async () => {
  const b = await chromium.launch();
  for (const lang of ['ar', 'en']) {
    const t = T[lang];
    const shots = ['01-home', '02-mushaf', '06-qibla'].map(n => png(`store-assets/screenshots/${lang}/iphone63/raw/${n}.png`));
    const html = `<!doctype html><html dir="${t.dir}"><head><meta charset="utf-8"><style>
@font-face{font-family:K;src:${font('node_modules/@fontsource/reem-kufi/files/reem-kufi-arabic-600-normal.woff2')};unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:K;src:${font('node_modules/@fontsource/reem-kufi/files/reem-kufi-latin-600-normal.woff2')}}
@font-face{font-family:P;src:${font('node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2')};unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:P;src:${font('node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2')}}
*{box-sizing:border-box;margin:0}
body{width:2622px;height:1475px;overflow:hidden;color:#F1EBDC;font-family:P,sans-serif;
 background:radial-gradient(70% 90% at ${lang==='ar'?'72%':'28%'} 45%,#17503A 0%,#0B2A1E 50%,#050D09 100%);position:relative}
body::before{content:"";position:absolute;inset:0;opacity:.13;background-image:
 radial-gradient(circle at 50% 50%,transparent 38%,#D4AE5C 39%,#D4AE5C 41%,transparent 42%),
 linear-gradient(45deg,transparent 47%,#D4AE5C 48%,#D4AE5C 52%,transparent 53%),linear-gradient(-45deg,transparent 47%,#D4AE5C 48%,#D4AE5C 52%,transparent 53%);
 background-size:120px 120px}
body::after{content:"";position:absolute;inset:0;background:radial-gradient(1.6px 1.6px at 10% 20%,#F6DFA0 50%,transparent 51%),radial-gradient(1.4px 1.4px at 85% 15%,#F6DFA0 50%,transparent 51%),radial-gradient(1.2px 1.2px at 60% 85%,#F6DFA0 50%,transparent 51%),radial-gradient(1.4px 1.4px at 30% 70%,#F6DFA0 50%,transparent 51%),radial-gradient(1.2px 1.2px at 75% 60%,#F6DFA0 50%,transparent 51%);opacity:.7}
.wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:150px;padding:0 220px;z-index:1}
.txt{width:960px;display:flex;flex-direction:column;align-items:${lang==='ar'?'flex-start':'flex-start'};gap:34px}
.brand{display:flex;align-items:center;gap:30px}
.brand img.m{height:170px;filter:drop-shadow(0 10px 30px rgba(0,0,0,.5))}
.brand img.w{height:110px}
h1{font-family:K,sans-serif;font-weight:600;font-size:${lang==='ar'?80:84}px;line-height:1.25;background:linear-gradient(105deg,#B8893A,#F6DFA0 45%,#E7C77E 60%,#B8893A);-webkit-background-clip:text;color:transparent}
.rule{width:220px;height:3px;background:linear-gradient(${lang==='ar'?'270deg':'90deg'},#D4AE5C,transparent)}
p{font-size:40px;line-height:1.6;color:#E9E1CC;opacity:.92}
.free{display:inline-block;margin-top:8px;padding:16px 34px;border:2px solid rgba(212,174,92,.6);border-radius:999px;font-size:34px;color:#F6DFA0;background:rgba(5,13,9,.35)}
.phones{position:relative;width:1150px;height:1300px}
.ph{position:absolute;width:520px;border-radius:64px;padding:14px;background:linear-gradient(145deg,#E7C77E,#8A6526 40%,#D4AE5C 70%,#7A5520);box-shadow:0 50px 120px rgba(0,0,0,.6)}
.ph img{display:block;width:100%;border-radius:52px}
.p1{left:315px;top:60px;z-index:3}
.p2{left:0;top:170px;transform:rotate(-7deg);z-index:2;opacity:.96}
.p3{right:0;top:170px;transform:rotate(7deg);z-index:2;opacity:.96}
</style></head><body><div class="wrap">
<div class="txt"><div class="brand"><img class="m" src="${svg('public/brand/logo-mark.svg')}"><img class="w" src="${svg('public/brand/wordmark-on-dark.svg')}"></div>
<h1>${t.title}</h1><div class="rule"></div><p>${t.sub}</p><span class="free">${t.free}</span></div>
<div class="phones"><div class="ph p2"><img src="${shots[1]}"></div><div class="ph p3"><img src="${shots[2]}"></div><div class="ph p1"><img src="${shots[0]}"></div></div>
</div></body></html>`;
    const page = await b.newPage({ viewport: { width: 2622, height: 1475 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
    const out = R(`store-assets/appstore/header-${lang}-5244x2950.png`);
    await page.screenshot({ path: out }); await page.close(); console.log(out);
  }
  await b.close();
})();
