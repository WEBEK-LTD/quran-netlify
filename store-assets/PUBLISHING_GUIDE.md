# نور القرآن — دليل النشر على المتاجر
# Nur Al-Quran — Publishing Guide

════════════════════════════════════════════════════════
 STEP 0: المتطلبات (Install First)
════════════════════════════════════════════════════════

Windows / Mac:
  1. Node.js 18+     → nodejs.org
  2. Java JDK 17+    → adoptium.net  (Android فقط)
  3. Android Studio  → developer.android.com/studio (Android)
  4. Xcode 15+       → Mac App Store  (iOS — Mac فقط)

بعد التثبيت:
  node --version   # يكون 18+
  java --version   # يكون 17+


════════════════════════════════════════════════════════
 STEP 1: Build الكود
════════════════════════════════════════════════════════

# 1. افتح Terminal في مجلد المشروع
cd quran-netlify

# 2. ثبّت الحزم
npm install

# 3. ابن الموقع
npm run build
# يُنشئ مجلد dist/

# 4. أضف منصة Android (مرة واحدة فقط)
npx cap add android

# على Mac أضف iOS أيضاً:
npx cap add ios

# 5. زامن الملفات
npx cap sync


════════════════════════════════════════════════════════
 STEP 2: Android APK/AAB
════════════════════════════════════════════════════════

# افتح Android Studio
npx cap open android

في Android Studio:
  ① انتظر حتى يكتمل Gradle sync (قد يأخذ 5-10 دقائق أول مرة)
  ② من القائمة: Build → Generate Signed Bundle / APK
  ③ اختر: Android App Bundle (AAB) ← أفضل للـ Play Store
  ④ أنشئ keystore جديد:
     Key store path: اختر مكاناً آمناً (مثلاً ~/nuralquran-key.jks)
     Password: اختر كلمة مرور قوية
     Key alias: nuralquran
     Validity: 25 years
     Name: اسمك
  ⑤ احفظ معلومات الـ keystore بأمان — ستحتاجها دائماً!
  ⑥ اختر: release
  ⑦ اضغط Finish
  ⑧ الملف يُحفظ في: android/app/release/app-release.aab


════════════════════════════════════════════════════════
 STEP 3: رفع على Google Play
════════════════════════════════════════════════════════

① اذهب لـ: play.google.com/console
② سجّل حساب مطور (25$ مرة واحدة)
③ اضغط: Create App
④ أدخل البيانات:
   App name: نور القرآن - قرآن كريم كامل
   Default language: Arabic
   App or game: App
   Free or paid: Free
⑤ Dashboard → Production → Create new release
⑥ ارفع ملف AAB
⑦ أدخل release notes من STORE_LISTING.txt
⑧ Store Listing:
   - أدخل الوصف من STORE_LISTING.txt
   - ارفع الأيقونة: store-assets/icons/icon-512.png
   - ارفع Feature Graphic: store-assets/feature-graphic-1024x500.png
   - ارفع screenshots (خذ screenshots من المتصفح أو الإيميولاتور)
⑨ Content Rating: أجب على الأسئلة
⑩ اضغط: Send for Review
⑪ انتظر 1-3 أيام للمراجعة


════════════════════════════════════════════════════════
 STEP 4: iOS IPA (يحتاج Mac + Apple Developer Account)
════════════════════════════════════════════════════════

# 1. اشترك في Apple Developer Program (99$/سنة)
#    developer.apple.com/programs

# 2. افتح Xcode
npx cap open ios

في Xcode:
  ① Signing & Capabilities:
     - Team: اختر حسابك
     - Bundle ID: net.nuralquran.app
  ② Product → Archive
  ③ Distribute App → App Store Connect
  ④ انتظر حتى يكتمل الرفع

في App Store Connect (appstoreconnect.apple.com):
  ① My Apps → + → New App
  ② أدخل البيانات من STORE_LISTING.txt
  ③ ارفع Screenshots
  ④ اختر الـ build الذي رفعته من Xcode
  ⑤ Submit for Review
  ⑥ انتظر 1-7 أيام للمراجعة


════════════════════════════════════════════════════════
 STEP 5: بعد كل تحديث للكود
════════════════════════════════════════════════════════

# تحديث version في capacitor.config.json أو build.gradle
# ثم:

npm run build
npx cap sync
npx cap open android   # أو ios

# في Android Studio: Build → Generate Signed Bundle (same keystore)
# ارفع AAB الجديد على Play Console


════════════════════════════════════════════════════════
 ICONS CHECKLIST ✅
════════════════════════════════════════════════════════

✅ store-assets/icons/icon-1024.png   ← Google Play / App Store
✅ store-assets/icons/icon-512.png    ← Google Play Feature Graphic
✅ store-assets/icons/icon-192.png    ← PWA
✅ store-assets/feature-graphic-1024x500.png  ← Google Play Header
✅ store-assets/splash/               ← Splash screens
✅ public/icons/icon-*.png            ← Web PWA icons

Android Studio يحتاج:
  ✅ android/mipmap-*/ic_launcher.png  ← تم إنشاؤها


════════════════════════════════════════════════════════
 IMPORTANT — Keystore Backup
════════════════════════════════════════════════════════

⚠️  احفظ ملف الـ keystore في مكانين منفصلين!
    لو ضاع مش هتقدر تحدّث التطبيق على Play Store أبداً.

المعلومات اللي لازم تحتفظ بيها:
  - keystore file (.jks)
  - Store password
  - Key alias
  - Key password


════════════════════════════════════════════════════════
 ALTERNATIVE: Bubblewrap (أسرع لـ Android فقط)
════════════════════════════════════════════════════════

لو عايز تنشر على Android بشكل أسرع بدون Android Studio:

npm install -g @bubblewrap/cli
bubblewrap init --manifest https://nuralquran.net/manifest.json
bubblewrap build

يطلع APK جاهز للرفع مباشرة على Play Store.
الشرط: موقعك على nuralquran.net لازم يكون شغّال.


════════════════════════════════════════════════════════
 LINKS
════════════════════════════════════════════════════════

Google Play Console:   play.google.com/console
App Store Connect:     appstoreconnect.apple.com
Apple Developer:       developer.apple.com/programs
Android Studio:        developer.android.com/studio
Capacitor Docs:        capacitorjs.com/docs
