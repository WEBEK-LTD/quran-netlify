#!/bin/bash
# ═══════════════════════════════════════════════════════
# نور القرآن — دليل التحويل لتطبيق iOS & Android
# ═══════════════════════════════════════════════════════

set -e
GREEN='\033[0;32m'
GOLD='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GOLD}"
echo "╔══════════════════════════════════════╗"
echo "║       نور القرآن — App Builder       ║"
echo "╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── الخطوة 1: التحقق من المتطلبات ──────────────────────
echo -e "${GREEN}[1/6] التحقق من المتطلبات...${NC}"

command -v node >/dev/null || { echo -e "${RED}❌ Node.js غير مثبت — نزّله من nodejs.org${NC}"; exit 1; }
command -v npm  >/dev/null || { echo -e "${RED}❌ npm غير مثبت${NC}"; exit 1; }

NODE_VER=$(node --version | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 18 ]; then
    echo -e "${RED}❌ Node.js يجب أن يكون 18+ — عندك v$(node --version)${NC}"
    exit 1
fi

echo "  ✅ Node.js $(node --version)"
echo "  ✅ npm $(npm --version)"

# ── الخطوة 2: تثبيت الحزم ──────────────────────────────
echo -e "\n${GREEN}[2/6] تثبيت الحزم...${NC}"
npm install

# ── الخطوة 3: بناء الموقع ──────────────────────────────
echo -e "\n${GREEN}[3/6] بناء الموقع (Vite build)...${NC}"
npm run build
echo "  ✅ تم إنشاء مجلد dist/"

# ── الخطوة 4: تهيئة Capacitor ─────────────────────────
echo -e "\n${GREEN}[4/6] تهيئة Capacitor...${NC}"

if [ ! -d "android" ] && [ ! -d "ios" ]; then
    echo "  جاري إضافة منصة Android..."
    npx cap add android
    echo "  ✅ Android"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  جاري إضافة منصة iOS..."
        npx cap add ios
        echo "  ✅ iOS"
    else
        echo "  ⚠️  iOS يحتاج Mac — تخطّينا"
    fi
else
    echo "  ✅ المنصات موجودة بالفعل"
fi

# ── الخطوة 5: مزامنة الملفات ──────────────────────────
echo -e "\n${GREEN}[5/6] مزامنة الملفات مع Capacitor...${NC}"
npx cap sync
echo "  ✅ تمت المزامنة"

# ── الخطوة 6: فتح IDE ──────────────────────────────────
echo -e "\n${GREEN}[6/6] فتح المشروع...${NC}"
echo ""
echo -e "${GOLD}══════════════════════════════════════════${NC}"
echo -e "${GOLD}  الخطوات التالية:${NC}"
echo -e "${GOLD}══════════════════════════════════════════${NC}"
echo ""
echo "  📱 Android:"
echo "    npx cap open android"
echo "    → في Android Studio: Build → Generate Signed Bundle"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  🍎 iOS:"
    echo "    npx cap open ios"
    echo "    → في Xcode: Product → Archive"
    echo ""
fi

echo "  🔄 بعد كل تعديل على الكود:"
echo "    npm run build && npx cap sync"
echo ""
echo -e "${GREEN}✅ جاهز!${NC}"
