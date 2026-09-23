import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'it', 'es', 'fr'],
  defaultLocale: 'en',
  // Keeps existing English URLs unprefixed (bettazoo.com/bet stays valid);
  // only non-default locales get a prefix (bettazoo.com/it/bet).
  localePrefix: 'as-needed',
})

export type AppLocale = (typeof routing.locales)[number]
