import sodium from "libsodium-wrappers-sumo";
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export interface Wrapped { nonce: string; ct: string }
export interface KdfParams { alg: "argon2id13"; opslimit: number; memlimit: number; salt: string }
export interface KeyFile {
  version: 1;
  kdf: KdfParams;
  byPassphrase: Wrapped;
  byRecovery: Wrapped;
}

type Sodium = typeof sodium;

export async function ready(): Promise<Sodium> {
  await sodium.ready;
  return sodium;
}

const b64 = (s: Sodium, u: Uint8Array) => s.to_base64(u, s.base64_variants.ORIGINAL);
const unb64 = (s: Sodium, t: string) => s.from_base64(t, s.base64_variants.ORIGINAL);

export function newKdf(s: Sodium, interactive = false): KdfParams {
  return {
    alg: "argon2id13",
    opslimit: interactive ? s.crypto_pwhash_OPSLIMIT_INTERACTIVE : s.crypto_pwhash_OPSLIMIT_MODERATE,
    memlimit: interactive ? s.crypto_pwhash_MEMLIMIT_INTERACTIVE : s.crypto_pwhash_MEMLIMIT_MODERATE,
    salt: b64(s, s.randombytes_buf(s.crypto_pwhash_SALTBYTES)),
  };
}

export function deriveKek(s: Sodium, passphrase: string, kdf: KdfParams): Uint8Array {
  return s.crypto_pwhash(
    32, passphrase.normalize("NFKC"), unb64(s, kdf.salt),
    kdf.opslimit, kdf.memlimit, s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export function wrap(s: Sodium, key: Uint8Array, data: Uint8Array): Wrapped {
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(data, null, null, nonce, key);
  return { nonce: b64(s, nonce), ct: b64(s, ct) };
}

/** Throws on wrong key or tampering. */
export function unwrap(s: Sodium, key: Uint8Array, w: Wrapped): Uint8Array {
  return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, unb64(s, w.ct), null, unb64(s, w.nonce), key);
}

export function newRecoveryKey(s: Sodium): { key: Uint8Array; phrase: string } {
  const key = s.randombytes_buf(32);
  return { key, phrase: entropyToMnemonic(key, wordlist) };
}

export function recoveryKeyFromPhrase(phrase: string): Uint8Array {
  const p = phrase.trim().toLowerCase().split(/\s+/).join(" ");
  if (!validateMnemonic(p, wordlist)) throw new Error("Invalid recovery phrase");
  return mnemonicToEntropy(p, wordlist);
}

