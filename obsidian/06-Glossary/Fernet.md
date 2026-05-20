---
tags: [glossary]
---

# Fernet

Symmetric authenticated encryption scheme: AES-128-CBC for confidentiality plus HMAC-SHA256 for integrity, with versioned tokens. Used here to encrypt secrets at rest in [[App Settings]] (API keys, exchange credentials). Keys come from the `SECRETS_ENCRYPTION_KEYS` env var — multi-key list supports rotation. See [[Fernet Encryption]].

## See also

- [[_index]]
- [[Fernet Encryption]]
- [[App Settings]]
