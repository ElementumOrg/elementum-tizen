import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function storage(init: Record<string, string> = {}) {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => void (data[k] = v),
    removeItem: (k: string) => void delete data[k],
  };
}

test('t fills vars and falls back to the key', async () => {
  const i = await import('../src/i18n');
  i.setLanguage('de_de');
  expect(i.t('nav.settings')).toBe('Einstellungen');
  expect(i.t('setup.test')).toBe('Verbindung testen');
  expect(i.t('waiting.title', { server: '1.2.3.4:65220' })).toBe('Warte auf Elementum unter 1.2.3.4:65220 …');
  expect(i.t('no.such.key')).toBe('no.such.key');
  expect(i.apiLang()).toBe('de-DE');
});

test('matchLanguage maps locales to Elementum languages', async () => {
  const { matchLanguage } = await import('../src/i18n');
  expect(matchLanguage('de_DE')).toBe('de_de');
  expect(matchLanguage('pt-BR')).toBe('pt_br');
  expect(matchLanguage('pt')).toBe('pt_pt');
  expect(matchLanguage('es_US')).toBe('es_es');
  expect(matchLanguage('en_US')).toBe('en_gb');
  expect(matchLanguage('uk')).toBe('uk_ua');
  expect(matchLanguage('pt_BR.UTF-8')).toBe('pt_br');
  expect(matchLanguage('de_AT@euro')).toBe('de_de');
  expect(matchLanguage('fil_PH')).toBeUndefined(); // not fi_fi
  expect(matchLanguage('ja_JP')).toBeUndefined();
  expect(matchLanguage(undefined)).toBeUndefined();
});

test('detection: Tizen LOCALE, then navigator.language, then English; a saved choice wins and persists', async () => {
  vi.stubGlobal('navigator', { language: 'fr-FR' });
  vi.stubGlobal('tizen', { systeminfo: { getPropertyValue: (_: string, ok: (l: { language: string }) => void) => ok({ language: 'ru_RU' }) } });
  let i = await import('../src/i18n');
  await i.initLanguage();
  expect(i.language()).toBe('ru_ru');

  vi.stubGlobal('tizen', { systeminfo: { getPropertyValue: () => { throw new Error('no privilege'); } } });
  await i.initLanguage();
  expect(i.language()).toBe('fr_fr');

  vi.stubGlobal('tizen', undefined);
  vi.stubGlobal('navigator', { language: 'ja-JP' });
  await i.initLanguage();
  expect(i.language()).toBe('en_gb');

  const ls = storage();
  vi.stubGlobal('localStorage', ls);
  let renders = 0;
  i.onLanguageChange(() => renders++);
  i.setLanguage('it_it');
  expect(ls.data['elementum.language']).toBe('it_it');
  expect(i.language()).toBe('it_it');
  expect(renders).toBe(1);

  vi.resetModules();
  i = await import('../src/i18n');
  await i.initLanguage();
  expect(i.language()).toBe('it_it'); // persisted choice overrides the TV
  i.setLanguage('');
  expect(i.language()).toBe('en_gb');
  expect(ls.data['elementum.language']).toBeUndefined();
});

test('settings use the elementum. prefix and survive a throwing localStorage', async () => {
  const s = await import('../src/settings');
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } });
  expect(s.loadServer()).toEqual({ ip: '', port: '65220', user: '', password: '' });
  expect(() => s.save('ip', '1.2.3.4')).not.toThrow();

  const ls = storage();
  vi.stubGlobal('localStorage', ls);
  s.saveServer({ ip: '1.2.3.4', port: '8080', user: 'u', password: '' });
  expect(ls.data).toEqual({ 'elementum.ip': '1.2.3.4', 'elementum.port': '8080', 'elementum.user': 'u' });
  expect(s.loadServer()).toEqual({ ip: '1.2.3.4', port: '8080', user: 'u', password: '' });
});

test('cleanServer validates the Setup fields', async () => {
  const { cleanServer } = await import('../src/settings');
  const s = (ip: string, port = '65220') => cleanServer({ ip, port, user: 'u', password: 'p' });
  expect(s(' 192.168.1.10 ')).toEqual({ server: { ip: '192.168.1.10', port: '65220', user: 'u', password: 'p' } });
  expect(s('http://nas.local/')).toMatchObject({ server: { ip: 'nas.local' } });
  expect(s('fe80::1')).toMatchObject({ server: { ip: '[fe80::1]' } });
  expect(s('[::1]')).toMatchObject({ server: { ip: '[::1]' } });
  expect(s('1.2.3.4:65220')).toEqual({ error: 'setup.ip_with_port' });
  expect(s('http://1.2.3.4:65220/')).toEqual({ error: 'setup.ip_with_port' });
  expect(s('')).toEqual({ error: 'setup.invalid_ip' });
  expect(s('a b')).toEqual({ error: 'setup.invalid_ip' });
  expect(s('x/../y?')).toMatchObject({ server: { ip: 'x' } });
  expect(s('h', '0')).toEqual({ error: 'setup.invalid_port' });
  expect(s('h', '70000')).toEqual({ error: 'setup.invalid_port' });
  expect(s('h', '1.5')).toEqual({ error: 'setup.invalid_port' });
  expect(s('h', ' 8080 ')).toMatchObject({ server: { port: '8080' } });
});
