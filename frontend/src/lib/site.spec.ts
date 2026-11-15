import { describe, expect, it } from 'vitest';
import { SITE, normalizeExternalUrl } from '@/lib/site';
import { createPageMetadata } from '@/lib/seo';

describe('site metadata', () => {
  it('creates canonical page metadata and unique keywords', () => {
    const metadata = createPageMetadata({
      path: '/about',
      title: 'About DexBotX',
      description: 'Learn about DexBotX.',
      keywords: ['project', 'project'],
    });

    expect(metadata.title).toEqual({ absolute: 'About DexBotX' });
    expect(metadata.alternates?.canonical).toBe('/about');
    expect(metadata.keywords).toContain('project');
    expect(new Set(SITE.keywords).size).toBe(SITE.keywords.length);
    const metaKeywords = Array.isArray(metadata.keywords) ? metadata.keywords : [];
    expect(new Set(metaKeywords).size).toBe(metaKeywords.length);
  });

  it('normalizes valid external profile URLs and rejects invalid values', () => {
    expect(normalizeExternalUrl(' youtube.com/@dexgamexx1 ')).toBe('https://youtube.com/@dexgamexx1');
    expect(normalizeExternalUrl('https://www.youtube.com/@dexgamexx1')).toBe('https://www.youtube.com/@dexgamexx1');
    expect(normalizeExternalUrl('')).toBeUndefined();
    expect(normalizeExternalUrl('not a url')).toBeUndefined();
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeUndefined();
  });
});
