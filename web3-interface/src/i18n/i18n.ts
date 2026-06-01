import { addMessages, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import en from './en.json';
import zh from './zh.json';

const LOCALE_STORAGE_KEY = 'web3-locale';

addMessages('en-US', en);
addMessages('zh-CN', zh);

init({
  fallbackLocale: 'en-US',
  initialLocale: 'en-US',
});

export const initi18n = async () => {
  const normalizeLocale = () => {
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (stored) return stored;
    const navLocale = getLocaleFromNavigator();
    if (navLocale?.startsWith('zh')) {
      return 'zh-CN';
    }
    if (!navLocale || navLocale.startsWith('en-')) {
      return 'en-US';
    }
    return 'en-US';
  };

  locale.set(normalizeLocale());
};

export const langs = [
  { name: 'English', key: 'en-US' },
  { name: '中文', key: 'zh-CN' },
];

export const getNameByKey = (k: string) => {
  const lang = langs.find((lang) => lang.key === k);
  return lang ? lang.name : 'English';
};

export const setLocale = (key: string) => {
  const nextLocale = langs.some((lang) => lang.key === key) ? key : 'en-US';
  locale.set(nextLocale);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }
};
