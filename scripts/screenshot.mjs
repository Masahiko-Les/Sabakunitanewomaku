import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const W = 390, H = 780, DPR = 2;
const OUT = resolve(__dir, '..', 'screenshots');
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function shoot(url, prefix, useLocalStorage) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: DPR,
  });
  const page = await ctx.newPage();

  if (useLocalStorage) {
    await page.addInitScript(() => {
      const key = 'sabaku-ni-tane-v3';
      try {
        const s = JSON.parse(localStorage.getItem(key) || '{}');
        s.introSeen = true;
        localStorage.setItem(key, JSON.stringify(s));
      } catch {}
    });
  }

  await page.goto(url, { waitUntil: 'load' });
  // Firebase 版は匿名ログイン後に説明シートが開くので、開くまで少し待つ
  await page.locator('#sheet.on').waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Close any open sheet (auto-shown help sheet)
  const scrimVisible = await page.evaluate(() => document.querySelector('.scrim')?.classList.contains('on'));
  if (scrimVisible) {
    await page.evaluate(() => document.querySelector('.scrim')?.click());
    await page.waitForTimeout(500);
  }

  // Day
  await page.screenshot({ path: `${OUT}/${prefix}_day.png` });

  // Night
  // 試作版は ☾ ボタン、公開版は設定（⚙）の「夜」
  const sky = async m => {
    if (await page.$('#btnSky')) { await page.click('#btnSky'); return; }
    await page.click('#btnSet'); await page.waitForTimeout(400);
    await page.click(`[data-sky="${m}"]`); await page.click('#x'); await page.waitForTimeout(400);
  };
  await sky('night');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${prefix}_night.png` });

  // Back to day
  await sky('day');
  await page.waitForTimeout(500);

  // Help sheet
  if (await page.$('#btnHelp')) await page.click('#btnHelp');
  else { await page.click('#btnSet'); await page.waitForTimeout(400); await page.click('#sHelp'); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${prefix}_help.png` });
  await page.evaluate(() => document.querySelector('.scrim')?.click());
  await page.waitForTimeout(400);

  // Mine sheet
  await page.click('#btnMine');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${prefix}_mine.png` });
  await page.evaluate(() => document.querySelector('.scrim')?.click());
  await page.waitForTimeout(400);

  await ctx.close();
  console.log(`Done: ${prefix}_*.png`);
}

await shoot('http://localhost:5173', 'vite', true);

const protoPath = 'file:///' + resolve(__dir, '..', 'prototype', 'index.html').replace(/\\/g, '/');
await shoot(protoPath, 'proto', false);

await browser.close();
