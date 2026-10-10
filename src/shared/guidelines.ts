import type { App, Creative, DeviceId, Slide } from './types';
import { slideInDevice } from './devices';

// Checks drawn from Apple's App Store asset best practices and screenshot specifications:
// https://developer.apple.com/app-store/asset-best-practices/
// https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

export interface Issue {
  level: 'error' | 'warn';
  message: string;
}

const RULES: { test: RegExp; message: string; level: Issue['level'] }[] = [
  {
    test: /app of the day|game of the day|editor'?s choice|apple design award|featured by apple/i,
    message: "Remove Apple recognitions (App of the Day, Editors' Choice, Apple Design Award). Apple shows these itself.",
    level: 'error',
  },
  {
    test: /[$€£¥]\s?\d|\d+\s?%\s?off|\bfree trial\b|\bdiscount\b|\bon sale\b|\bper month\b|\/mo\b/i,
    message: 'Leave out prices and discounts — they date the screenshot and vary by region.',
    level: 'error',
  },
  { test: /https?:\/\/|www\.|\.(com|io|app|net|org)\b/i, message: 'Leave out website URLs.', level: 'error' },
  { test: /[©®™]/, message: 'Leave out ©, ® and ™ symbols.', level: 'error' },
  {
    test: /\bandroid\b|google play|play store|\bwindows\b|\bgalaxy\b|\bpixel\b/i,
    message: 'Don’t mention other platforms or stores.',
    level: 'error',
  },
  {
    test: /#1\b|number one|best app|award[- ]winning|most popular/i,
    message: 'Avoid claims you can’t verify (#1, award-winning, best).',
    level: 'warn',
  },
];

const plain = (s: string) => s.replace(/\*/g, '').replace(/\\n/g, '\n');

export function checkSlide(slide: Slide): Issue[] {
  const issues: Issue[] = [];
  const text = `${plain(slide.headline)}\n${plain(slide.subtitle)}`;
  for (const r of RULES) if (r.test.test(text)) issues.push({ level: r.level, message: r.message });

  const words = plain(slide.headline).split(/\s+/).filter(Boolean).length;
  if (words > 9) issues.push({ level: 'warn', message: `Headline is ${words} words. Apple suggests a short phrase; aim for 7 or fewer.` });
  const lines = plain(slide.headline).split('\n').length;
  if (lines > 3) issues.push({ level: 'warn', message: 'More than three headline lines will crowd the screenshot.' });
  return issues;
}

/** Product page header / search results: the same text rules, and one short phrase. */
export function checkCreative(c: Creative): Issue[] {
  const issues: Issue[] = [];
  const text = `${plain(c.headline)}\n${plain(c.subtitle)}`;
  for (const r of RULES) if (r.test.test(text)) issues.push({ level: r.level, message: r.message });
  const words = plain(c.headline).split(/\s+/).filter(Boolean).length;
  if (words > 7) issues.push({ level: 'warn', message: `Headline is ${words} words. Apple asks for one short phrase on creative assets.` });
  return issues;
}

export function checkDevice(app: App, device: DeviceId): Issue[] {
  const n = app.slides.filter((s) => slideInDevice(s, device)).length;
  const issues: Issue[] = [];
  if (n > 10) issues.push({ level: 'error', message: `${n} slides — App Store Connect accepts at most 10 per device size.` });
  if (n === 0) issues.push({ level: 'warn', message: 'No slides yet. At least one screenshot is required.' });
  return issues;
}

/** Up to three screenshots can appear in search results, so the first three carry the pitch. */
export const SEARCH_RESULT_SLOTS = 3;
