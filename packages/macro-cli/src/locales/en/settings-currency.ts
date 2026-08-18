export const EN_SETTINGS_CURRENCY = {
	"settings.schema.values.currency.defaultCurrency.title": "Default Currency",
	"settings.schema.values.currency.defaultCurrency.desc":
		"Default 3-letter ISO 4217 currency code (e.g. 'USD', 'EUR', 'GBP').",
	"settings.schema.values.currency.templates.title": "Currency Format Templates",
	"settings.schema.values.currency.templates.desc":
		"Ordered format templates using tokens (SYM, CODE, AMOUNT, SUBUNITS, OP).",
	"settings.schema.values.currency.allowSubunits.title": "Allow Subunits",
	"settings.schema.values.currency.allowSubunits.desc":
		"Enable parsing subunit expressions (e.g. '50 cents', '20 pence').",
	"settings.schema.values.currency.accountingParens.title":
		"Accounting Parentheses for Negative",
	"settings.schema.values.currency.accountingParens.desc":
		"Parse ($100) as negative currency amount -$100.",
} as const;
