/**
 * Wire protocol version. Version 3 introduced the rich Extension Activation
 * Group model (`extensionGroups`/`activeExtensionGroupId` plus group resolution
 * DTOs) and removed the previous extension-profile fields. There is no
 * compatibility handling for older versions.
 */
export const MACRO_PROTOCOL_VERSION = 3 as const;
export type MacroProtocolVersion = typeof MACRO_PROTOCOL_VERSION;
