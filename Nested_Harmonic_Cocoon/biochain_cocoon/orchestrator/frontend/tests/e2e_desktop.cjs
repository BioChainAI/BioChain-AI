const { chromium } = require('playwright');
const fs = require('fs');
const SP = process.argv[2], BASE = process.argv[3];  // SP: work dir with tokens.json; screenshots are written there
const tokens = JSON.parse(fs.readFileSync(SP + '/tokens.json'));
const APP = `export function initializeApp(c){ return { options: c }; }`;
const AUTH = `
let cbs = [], user = null;
const mk = (who) => ({ uid: who.uid, displayName: who.name, email: who.uid + '@example.com', photoURL: null, getIdToken: async () => who.token });
if (window.__AS) user = mk(window.__AS);
if (!user && sessionStorage.getItem('fake-signed-in')) user = mk(window.__LOGIN_AS);
export function getAuth(){ return { get currentUser(){ return user; } }; }
export class GoogleAuthProvider { setCustomParameters(){} }
export function onAuthStateChanged(a, cb){ cbs.push(cb); setTimeout(() => cb(user), 0); return () => {}; }
export async function signInWithPopup(){ sessionStorage.setItem('fake-signed-in','1'); user = mk(window.__LOGIN_AS); cbs.forEach(c => c(user)); return { user }; }
export async function signOut(){ sessionStorage.removeItem('fake-signed-in'); user = null; cbs.forEach(c => c(null)); }`;
async function page(browser, as, loginAs) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(([a, l]) => { window.__AS = a; window.__LOGIN_AS = l; }, [as, loginAs]);
  await ctx.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', body: APP }));
  await ctx.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', r => r.fulfill({ contentType: 'text/javascript', body: AUTH }));
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('console', m => m.type() === 'error' && p.errors.push(m.text()));
  return p;
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const alice = { uid: 'alice', name: 'Alice Rivera', token: tokens.alice };
  const bob = { uid: 'bob', name: 'Bob Chen', token: tokens.bob };
  const log = (...a) => console.log(...a);

  // 1. signed out → gate; sign in
  const p = await page(browser, null, alice);
  await p.goto(BASE + '/');
  await p.waitForSelector('#sign-in');
  await p.screenshot({ path: SP + '/01_login.png' });
  await p.click('#sign-in');
  await p.waitForSelector('#desk:not([hidden]) .tile');
  await p.waitForTimeout(2500);
  log('tiles after first sign-in:', await p.$$eval('.tile', t => t.map(x => x.dataset.instance)));
  await p.screenshot({ path: SP + '/02_desktop_first_run.png', fullPage: true });

  // 2. start a session from the overview module
  await p.click('.tile[data-instance="overview-1"] [data-a="start"]');
  await p.waitForTimeout(14000);
  await p.screenshot({ path: SP + '/03_session_running.png', fullPage: true });

  // 3. add-ons: add mesh health + spatial mapper, remove presets
  await p.click('#addons-open');
  await p.waitForSelector('#drawer:not([hidden])');
  await p.screenshot({ path: SP + '/04_addons.png' });
  await p.click('[data-add="mesh_health"]');
  await p.click('[data-add="spatial_mapper"]');
  await p.click('[data-remove="presets"]');
  await p.click('#drawer-close');
  // arrange: make mesh health XL
  await p.click('#edit-toggle');
  await p.click('.tile[data-instance="mesh_health-1"] [data-size="xl"]');
  await p.screenshot({ path: SP + '/05_arrange.png', fullPage: true });
  await p.click('#edit-toggle');
  await p.waitForTimeout(1500);                                   // debounced save

  // 4. reload → personal layout persisted on the hub
  await p.reload();
  await p.waitForSelector('#desk:not([hidden]) .tile');
  const after = await p.$$eval('.tile', t => t.map(x => x.dataset.instance + ':' + [...x.classList].filter(c => ['s','m','l','xl'].includes(c))));
  log('tiles after reload:', after);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: SP + '/06_after_reload.png', fullPage: true });

  // 5. bob signs in on another device: room busy, alice's biostate private, his own desktop
  const b = await page(browser, bob, bob);
  await b.goto(BASE + '/');
  await b.waitForSelector('#desk:not([hidden]) .tile');
  await b.waitForTimeout(4000);
  log('bob chips:', await b.$eval('#chips', e => e.textContent));
  log('bob biostate:', await b.$eval('.tile[data-instance="biostate-1"] .tile-body', e => e.textContent.trim()));
  log('bob tiles:', await b.$$eval('.tile', t => t.map(x => x.dataset.instance)));
  await b.screenshot({ path: SP + '/07_bob_view.png', fullPage: true });

  // 6. dark/light theme toggle + sign out
  await p.click('#user-btn');
  await p.screenshot({ path: SP + '/08_user_menu.png' });
  await p.click('[data-act="theme"]'); await p.click('#user-btn'); await p.click('[data-act="theme"]');
  await p.waitForTimeout(800);
  await p.screenshot({ path: SP + '/09_light.png', fullPage: true });
  await p.click('#user-btn'); await p.click('[data-act="signout"]');
  await p.waitForSelector('#sign-in');
  log('signed out ok');
  log('alice errors:', JSON.stringify(p.errors), 'bob errors:', JSON.stringify(b.errors));
  await browser.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
