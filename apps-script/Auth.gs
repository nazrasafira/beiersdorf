/**
 * Passwords, tokens and the login rate limit.
 * - Passwords: SHA-256(salt + password), hashed 1,000 times (Apps Script has no bcrypt).
 * - Token: base64(payload).base64(HMAC-SHA256(payload, SECRET)); payload { uid, tv, exp }.
 *   tv = the user's token_version; deactivating or resetting a password bumps it, so old tokens stop working.
 * - SECRET lives in Script Properties (made on first use), never in the code or the Sheet.
 */
const TOKEN_DAYS = 30;
const DEFAULT_PASSWORD = { spg: 'spg123', leader: 'leader123', supervisor: 'super123', admin: 'admin123' };

function hashPassword_(password, salt) {
  let bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  for (let i = 0; i < 1000; i++) bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return Utilities.base64Encode(bytes);
}

/** Sets a new password on a user row (not saved yet). */
function setPassword_(user, password) {
  user.salt = Utilities.getUuid();
  user.password_hash = hashPassword_(password, user.salt);
}

const checkPassword_ = (user, password) => !!user.password_hash && hashPassword_(password, user.salt) === user.password_hash;

function secret_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRET', s);
  }
  return s;
}

function sign_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret_()));
}

function makeToken_(user) {
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ uid: user.id, tv: user.token_version || 0, exp: Date.now() + TOKEN_DAYS * 864e5 }), Utilities.Charset.UTF_8);
  return payload + '.' + sign_(payload);
}

/** The logged-in user for a token, or a 401 error. */
function userFromToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) throw new ApiError(401, 'Silakan login lagi.');
  let p;
  try {
    p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) {
    throw new ApiError(401, 'Silakan login lagi.');
  }
  const user = byId_('Users', p.uid);
  if (!user || p.exp < Date.now() || (user.token_version || 0) !== p.tv) throw new ApiError(401, 'Silakan login lagi.');
  if (!user.active) throw new ApiError(401, 'Akun kamu tidak aktif. Hubungi atasanmu.');
  return user;
}

/** Signs the user out everywhere: every token made before this stops working. */
function revokeTokens_(user) {
  user.token_version = (user.token_version || 0) + 1;
}

/* Max 5 failed logins per phone number per 15 minutes */
function loginBlocked_(phone) {
  return Number(CacheService.getScriptCache().get('login:' + phone) || 0) >= 5;
}
function loginFailed_(phone) {
  const cache = CacheService.getScriptCache(), key = 'login:' + phone;
  cache.put(key, String(Number(cache.get(key) || 0) + 1), 15 * 60);
}
function loginOk_(phone) {
  CacheService.getScriptCache().remove('login:' + phone);
}
