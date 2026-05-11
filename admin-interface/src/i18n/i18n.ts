import { addMessages, init, getLocaleFromNavigator, locale } from 'svelte-i18n';
import en from './en.json';
import zh from './zh.json';

const LOCALE_STORAGE_KEY = 'admin-locale';
const REGISTERED_LOCALES = new Set(['en-US', 'zh-CN']);

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
    if (stored && REGISTERED_LOCALES.has(stored)) {
      return stored;
    }
    const locale = getLocaleFromNavigator();
    if (!locale || locale.startsWith('en-')) {
      return 'en-US';
    }
    return locale;
  };

  locale.set(normalizeLocale());
};

export const langs = [
  { name: 'English', key: 'en-US' },
  { name: '简体中文', key: 'zh-CN' },
];

export const getNameByKey = (k: string) => {
  const lang = langs.find((lang) => lang.key === k);
  return lang ? lang.name : 'English';
};
