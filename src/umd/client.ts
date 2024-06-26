import { split2 } from 'src/client/helpers'
import { I18nClient, CondensedDictionary, Locale, Translator, localeFlagsEngine } from '../client'
import { parse } from '../tools/gpt-js'

declare global {
	var T: Translator
}

export const localeFlags = localeFlagsEngine()

export var i18nClient: I18nClient, locale: Locale
var usedLocales: Locale[] = []

const preloaded: Record<Locale, CondensedDictionary[]> = {},
	resolvers: Record<Locale, (dictionary: CondensedDictionary[]) => void> = {}
export function preload(locale: Locale, dictionary: CondensedDictionary[]) {
	preloaded[locale] = dictionary
	if (resolvers[locale]) {
		resolvers[locale](dictionary)
		delete resolvers[locale]
	}
}

export function translatePage() {
	if (<any>globalThis.T)
		for (const element of document.querySelectorAll('[i18n]')) {
			const parts = element.getAttribute('i18n')!.split(',')
			for (const part of parts) {
				const [attr, key] = split2(part, ':').map((k) => k.trim())
				if (attr === 'html') element.innerHTML = T[key]()
				if (key) element.setAttribute(attr, T[key]())
				else element.textContent = T[attr]()
			}
		}
	// Translate before text is loaded
	// Just empty the translated elements before their rendering to avoid blinking
	else
		for (const element of document.querySelectorAll('[i18n]')) {
			const parts = element.getAttribute('i18n')!.split(',')
			for (const part of parts) {
				const [attr, key] = split2(part, ':').map((k) => k.trim())
				if (attr === 'html' || !key) element.textContent = ''
			}
		}
	const localesListElm = document.getElementById('locales-list')
	if (localesListElm) {
		const selectionList: string[] = [],
			usedLocale = locale

		for (const locale of usedLocales) {
			const flags = localeFlags(locale),
				flagsStr =
					flags.length === 1
						? flags[0]
						: `
		<span class="flag-main">${flags[0]}</span>
		<span class="flag-loc">${flags[1]}</span>
`,
				localeName = new Intl.DisplayNames(locale, { type: 'language' }).of(locale),
				selected = usedLocale === locale ? 'selected' : ''
			selectionList.push(`
<button class="locale ${selected}" onclick="OmnI18n.setLocale('${locale}')">
	<span class="flag">${flagsStr}</span>
	<span class="name">${localeName}</span>
</button>
`)
		}

		localesListElm.innerHTML = selectionList.join('')
	}

	const currentLocaleElm = document.getElementById('current-locale')
	if (currentLocaleElm) {
		const flags = localeFlags(locale),
			flagsStr =
				flags.length === 1
					? flags[0]
					: `
	<span class="flag-main">${flags[0]}</span>
	<span class="flag-loc">${flags[1]}</span>
`,
			localeName = new Intl.DisplayNames(locale, { type: 'language' }).of(locale)
		currentLocaleElm.innerHTML = `
<button class="locale">
	<span class="flag">${flagsStr}</span>
	<span class="name">${localeName}</span>
</button>
`
	}
}

async function loadLanguage() {
	globalThis.T = await i18nClient.enter()
	translatePage()
	for (const cb of localeChangeCBs) cb(locale)
}

class LocalLogI18nClient extends I18nClient {
	report(key: string, error: string, spec?: object | undefined): void {
		console.error(error, key)
		if (spec) console.dir(spec)
	}
}

/**
 * Initializes UMD usage of the library.
 * @param acceptedLocales A list of accepted locales. The first one is used by default if no match is found
 * @param fileNameTemplate Template of the source dictionary file name. `$` will be replaced by the locale
 */
export async function init(acceptedLocales: Locale[], fileNameTemplate?: string) {
	usedLocales = acceptedLocales
	const cookie = localStorage.getItem('language'),
		locales = [
			cookie ||
				navigator.languages?.find((l) => l && acceptedLocales.includes(l)) ||
				acceptedLocales[0]
		]
	// exported value
	locale = locales[0]
	i18nClient = new LocalLogI18nClient(locales, async () => {
		return (
			preloaded[locale] ||
			(fileNameTemplate
				? new Promise((resolve) => {
						const script = document.createElement('script')
						script.src = fileNameTemplate.replace('$', locale)
						;(document.currentScript?.parentElement || document.head).appendChild(script)
						// The script will resolve by calling `preload`
						resolvers[locale] = resolve
					})
				: new Promise((resolve) => (resolvers[locale] = resolve)))
		)
	})

	document.addEventListener('DOMContentLoaded', translatePage)

	await loadLanguage()
}

const localeChangeCBs: ((locale: Locale) => void)[] = []
export function onLocaleChange(cb: (locale: Locale) => void) {
	localeChangeCBs.push(cb)
	if (<any>globalThis.T) cb(locale)
	return () => localeChangeCBs.splice(localeChangeCBs.indexOf(cb), 1)
}

export async function setLocale(newLocale: Locale) {
	if (newLocale === locale) return
	i18nClient.setLocales([(locale = newLocale)])
	localStorage.setItem('language', locale)
	await loadLanguage()
}

let hcArgs = null
try {
	let textContent = document.currentScript?.textContent
	if (textContent) hcArgs = parse('[' + textContent + ']')
} catch (e) {}
if (hcArgs) init.apply(null, <any>hcArgs)
