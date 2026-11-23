# نور القرآن — دليل النشر على المتاجر

The complete, current guide (build, signing, CI, permissions, privacy answers, content
rating, child-safety page, screenshots, store texts in six languages) is
**[docs/APP.md](../docs/APP.md)**. This folder holds the store artwork:

| File | Use |
|---|---|
| `icons/icon-1024.png` | App Store icon; source of `npm run app:assets` |
| `icons/icon-512.png` | Google Play hi-res icon |
| `feature-graphic-1024x500.png` | Google Play feature graphic |
| `splash/` | splash sources |
| `app/` (generated, git-ignored) | `@capacitor/assets` inputs written by `scripts/app-icons.mjs` |
| `adhan/` | processed adhan recordings (`scripts/fetch-adhan.sh`) |
