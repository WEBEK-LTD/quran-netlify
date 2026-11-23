// Static checks for the native projects (runs anywhere, no Xcode / Android SDK):
//   npm run check:native
// - plist / entitlements / privacy manifest parse (XML plist subset) and hold the keys we rely on
// - AndroidManifest + resource XML are well-formed; Java plugin is registered
// - every recording in available.json has its processed files (dist, iOS CAF ≤ 30 s, Android raw)
// - capacitor.config.json, .well-known files are valid JSON
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const R = (...p) => resolve(root, ...p);
let failed = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failed++; console.error(`  ✗ ${msg}`); } };

// Tiny XML well-formedness check (tags balanced, attributes quoted) — enough to catch editing mistakes.
function wellFormed(xml) {
  // XML forbids «--» inside comments (aapt fails the Android build on it)
  for (const c of xml.match(/<!--[\s\S]*?-->/g) || []) if (c.slice(4, -3).includes('--')) return 'comment contains "--"';
  const body = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[\s\S]*?>/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m, last = 0;
  while ((m = re.exec(body))) {
    const between = body.slice(last, m.index);
    if (/[<>]/.test(between)) return `stray markup near: ${between.slice(0, 60)}`;
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) { if (stack.pop() !== name) return `unbalanced </${name}>`; }
    else stack.push(name);
  }
  if (/[<>]/.test(body.slice(last))) return 'stray markup at end';
  return stack.length ? `unclosed <${stack.pop()}>` : null;
}

// XML plist → JS (dict/array/string/true/false/integer/real/date/data)
function parsePlist(xml) {
  const tokens = xml.replace(/<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g).map(t => t.trim()).filter(Boolean);
  let i = 0;
  const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  function val() {
    const t = tokens[i++];
    if (t === '<dict>') { const o = {}; while (tokens[i] !== '</dict>') { if (tokens[i++] !== '<key>') throw new Error('key expected'); const k = un(tokens[i++]); if (tokens[i++] !== '</key>') throw new Error('</key>'); o[k] = val(); } i++; return o; }
    if (t === '<dict/>') return {};
    if (t === '<array>') { const a = []; while (tokens[i] !== '</array>') a.push(val()); i++; return a; }
    if (t === '<array/>') return [];
    if (t === '<true/>') return true;
    if (t === '<false/>') return false;
    const m = /^<(string|integer|real|date|data)>$/.exec(t);
    if (m) { if (tokens[i] === `</${m[1]}>`) { i++; return ''; } const v = un(tokens[i++]); if (tokens[i++] !== `</${m[1]}>`) throw new Error(`</${m[1]}>`); return m[1] === 'integer' ? parseInt(v, 10) : v; }
    if (t === '<string/>') return '';
    throw new Error(`unexpected ${t}`);
  }
  if (tokens[i++] !== '<plist version="1.0">') throw new Error('not a plist');
  const v = val();
  if (tokens[i] !== '</plist>') throw new Error('trailing content');
  return v;
}

console.log('iOS');
const info = parsePlist(readFileSync(R('ios/App/App/Info.plist'), 'utf8'));
ok(info.CFBundleDisplayName === 'نور القرآن', 'Info.plist parses; display name «نور القرآن»');
ok((info.UIBackgroundModes || []).includes('audio'), 'UIBackgroundModes has audio (recitation/radio with the screen locked)');
ok((info.UIBackgroundModes || []).includes('remote-notification'), 'UIBackgroundModes has remote-notification (push)');
ok(JSON.stringify(info.CFBundleURLTypes || []).includes('"nuralquran"'), 'custom URL scheme nuralquran://');
ok(!!info.NSLocationWhenInUseUsageDescription && !!info.NSMicrophoneUsageDescription, 'location + microphone purpose strings');
ok(JSON.stringify(info.UISupportedInterfaceOrientations) === '["UIInterfaceOrientationPortrait"]' && (info['UISupportedInterfaceOrientations~ipad'] || []).length === 4, 'iPhone portrait, iPad all orientations');
const scene = readFileSync(R('ios/App/App/SceneDelegate.swift'), 'utf8');
ok(/rootViewController = NQBridgeViewController\(\)/.test(scene) && /registerPluginInstance\(NQAudioPlugin\(\)\)/.test(scene) && /jsName = "NQAudio"/.test(scene), 'NQAudio plugin (voice-room audio session) registered by NQBridgeViewController');
ok(/\.playAndRecord/.test(scene) && /\.playback, mode: \.spokenAudio/.test(scene), 'NQAudio switches .playAndRecord (speaking) ↔ .playback (after)');
const ent = parsePlist(readFileSync(R('ios/App/App/App.entitlements'), 'utf8'));
ok((ent['com.apple.developer.associated-domains'] || []).includes('applinks:nuralquran.net'), 'entitlements: applinks:nuralquran.net');
ok(!!ent['aps-environment'], 'entitlements: aps-environment (push)');
const priv = parsePlist(readFileSync(R('ios/App/App/PrivacyInfo.xcprivacy'), 'utf8'));
ok(priv.NSPrivacyTracking === false && Array.isArray(priv.NSPrivacyAccessedAPITypes), 'PrivacyInfo.xcprivacy parses (no tracking, API reasons)');
for (const l of ['en', 'tr', 'fr', 'ur', 'id']) {
  const s = readFileSync(R(`ios/App/App/${l}.lproj/InfoPlist.strings`), 'utf8');
  ok(/"NSLocationWhenInUseUsageDescription"\s*=\s*".+";/.test(s) && /"NSMicrophoneUsageDescription"\s*=\s*".+";/.test(s), `${l}.lproj/InfoPlist.strings`);
}
const pbx = readFileSync(R('ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
ok(pbx.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;') && pbx.includes('PrivacyInfo.xcprivacy in Resources') && pbx.includes('InfoPlist.strings in Resources'), 'project.pbxproj: entitlements, privacy manifest, InfoPlist.strings wired');
ok(((pbx.match(/\{/g) || []).length === (pbx.match(/\}/g) || []).length) && ((pbx.match(/\(/g) || []).length === (pbx.match(/\)/g) || []).length), 'project.pbxproj braces/parens balanced');
ok(!wellFormed(readFileSync(R('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'), 'utf8')), 'shared scheme App.xcscheme');

console.log('Android');
const manifest = readFileSync(R('android/app/src/main/AndroidManifest.xml'), 'utf8');
ok(!wellFormed(manifest), 'AndroidManifest.xml well-formed');
for (const perm of ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'RECEIVE_BOOT_COMPLETED']) {
  ok(new RegExp(`<uses-permission android:name="android.permission.${perm}"`).test(manifest), `permission ${perm}`);
}
ok(!/<uses-permission android:name="android.permission.USE_EXACT_ALARM"/.test(manifest), 'USE_EXACT_ALARM not declared (Play policy)');
const liveManifest = manifest.replace(/<!--[\s\S]*?-->/g, '');
ok(/android\.permission\.RECORD_AUDIO"/.test(liveManifest) && /android\.permission\.MODIFY_AUDIO_SETTINGS"/.test(liveManifest), 'RECORD_AUDIO + MODIFY_AUDIO_SETTINGS declared (voice rooms)');
ok(!/FOREGROUND_SERVICE_MICROPHONE"/.test(liveManifest), 'FOREGROUND_SERVICE_MICROPHONE not declared (no background microphone)');
ok(/createChannel\(\{\s*id: 'community'/.test(readFileSync(R('src/native/push.js'), 'utf8')), "push.js creates the Android notification channel 'community'");
ok(/android:autoVerify="true"/.test(manifest) && /android:host="nuralquran.net"/.test(manifest), 'App Links intent filter (autoVerify)');
ok(/android:scheme="nuralquran"/.test(manifest), 'custom scheme intent filter');
ok(/foregroundServiceType="mediaPlayback"/.test(manifest), 'media playback service declared');
const resDir = R('android/app/src/main/res');
for (const d of readdirSync(resDir)) {
  const full = join(resDir, d);
  if (!statSync(full).isDirectory()) continue;
  for (const f of readdirSync(full).filter(x => x.endsWith('.xml'))) {
    const err = wellFormed(readFileSync(join(full, f), 'utf8'));
    if (err) ok(false, `${d}/${f}: ${err}`);
  }
}
ok(true, 'res/**/*.xml well-formed');
ok(/registerPlugin\(NQNativePlugin\.class\)/.test(readFileSync(R('android/app/src/main/java/net/nuralquran/app/MainActivity.java'), 'utf8')), 'NQNativePlugin registered in MainActivity');
{
  const plugin = readFileSync(R('android/app/src/main/java/net/nuralquran/app/NQNativePlugin.java'), 'utf8');
  const usesIt = /NQNative\.openAppSettings\(/.test(readFileSync(R('src/community/Room.jsx'), 'utf8'));
  ok(!usesIt || /@PluginMethod\s+public void openAppSettings\(/.test(plugin) && /ACTION_APPLICATION_DETAILS_SETTINGS/.test(plugin), 'NQNative.openAppSettings (voice rooms: allow the microphone) implemented in NQNativePlugin');
}

console.log('Adhan audio');
const { ids } = JSON.parse(readFileSync(R('src/native/adhan/available.json'), 'utf8'));
ok(ids.length > 0, `available recordings: ${ids.join(', ')}`);
const manifestRec = JSON.parse(readFileSync(R('src/native/adhan/recordings.json'), 'utf8')).recordings;
ok(ids.some(id => manifestRec.find(r => r.id === id && r.type === 'fajr')), 'at least one Fajr recording');
let ffprobe = true;
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); } catch { ffprobe = false; }
for (const id of ids) {
  const rec = manifestRec.find(r => r.id === id);
  ok(rec && rec.status === 'bundled' && rec.license && rec.author && rec.source, `${id}: licence, author, source recorded`);
  const caf = R('store-assets/adhan/ios', `nq_adhan_${id}.caf`);
  ok(existsSync(R('store-assets/adhan/full', `${id}.mp3`)) && existsSync(caf) && existsSync(R('android/app/src/main/res/raw', `adhan_${id}.mp3`)), `${id}: full mp3, iOS caf, Android raw`);
  if (ffprobe && existsSync(caf)) {
    const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', caf]).toString());
    ok(d > 0 && d <= 30, `${id}: iOS notification sound ${d.toFixed(1)} s ≤ 30 s`);
  }
}

console.log('Config / links');
for (const f of ['capacitor.config.json', 'public/.well-known/apple-app-site-association', 'public/.well-known/assetlinks.json']) {
  try { JSON.parse(readFileSync(R(f), 'utf8')); ok(true, `${f} is valid JSON`); } catch (e) { ok(false, `${f}: ${e.message}`); }
}
const cap = JSON.parse(readFileSync(R('capacitor.config.json'), 'utf8'));
ok(cap.appId === 'net.nuralquran.app', 'appId net.nuralquran.app');
const aasa = readFileSync(R('public/.well-known/apple-app-site-association'), 'utf8');
const links = readFileSync(R('public/.well-known/assetlinks.json'), 'utf8');
if (aasa.includes('TEAMID.') || links.includes('REPLACE_WITH_')) console.log('  ! placeholders left in .well-known files (Team ID / SHA-256) — fill them before release (docs/APP.md)');

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall native checks passed');
