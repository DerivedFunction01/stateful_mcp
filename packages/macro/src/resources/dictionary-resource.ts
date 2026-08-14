import type {
	DictionaryResource,
	DictionaryResourceFactory,
	DictionaryResourceOptions,
} from "./contracts";
import {
	createCoreDictionaryResourceFactory,
	createJsonlDictionaryResource,
	createMemoryDictionaryResource,
} from "./core-dictionary-adapter";

export function createDictionaryResourceFactory(
	ownerExtensionId: string,
	defaults: DictionaryResourceOptions = {},
): DictionaryResourceFactory {
	return createCoreDictionaryResourceFactory(ownerExtensionId, defaults);
}

export async function openMemoryDictionary(
	options: DictionaryResourceOptions = {},
): Promise<DictionaryResource> {
	return createMemoryDictionaryResource(options);
}

export async function openJsonlDictionary(
	path: string,
	options: DictionaryResourceOptions = {},
): Promise<DictionaryResource> {
	return createJsonlDictionaryResource(path, options);
}
