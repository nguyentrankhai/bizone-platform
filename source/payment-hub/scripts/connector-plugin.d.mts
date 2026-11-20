/** Types of scripts/connector-plugin.mjs (used by tests). */
export function signedMessage(files: Map<string, Uint8Array>): Buffer;
export function pack(dir: string, privateKeyPem: string, keyId: string): Uint8Array;
export function embedHost(src: string): string;
