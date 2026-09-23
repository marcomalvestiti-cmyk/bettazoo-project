import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'

// Messages are split into one file per feature area (rather than one giant
// per-locale JSON) so different pages/components can be translated independently
// without every edit touching the same file. All namespaces are merged here into
// the single messages object next-intl expects.
const NAMESPACES = [
  'common', 'home', 'howToPlay', 'rules', 'bet', 'event',
  'placer', 'placerStream', 'bettor', 'fund', 'faucet',
] as const

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale

  const modules = await Promise.all(
    NAMESPACES.map(ns => import(`../../messages/${locale}/${ns}.json`).then(m => m.default))
  )
  const messages = Object.assign({}, ...modules)

  return { locale, messages }
})
