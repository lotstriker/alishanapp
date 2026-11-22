'use strict';

const { createHash, randomBytes } = require('node:crypto');
const sessionName = '__Host-alishan-session';
const verifierName = '__Host-alishan-pkce';
const sessionLifetime = 24 * 60 * 60 * 1000;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const random = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const cookie = (req, name) => (req.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
const cookieOptions = { secure: true, httpOnly: true, sameSite: 'lax', path: '/' };

function sessionStore(pool) {
  return {
    async save(token, subject, expires) {
      const result = await pool.query(
        `INSERT INTO alishan_private.login_sessions (token_hash, subject, expires_at)
         SELECT $1,$2::uuid,$3 WHERE alishan_private.has_google_login_invite($2::uuid)`,
        [hash(token), subject, expires]);
      return result.rowCount === 1;
    },
    async get(token) {
      const result = await pool.query('SELECT subject FROM alishan_private.login_sessions WHERE token_hash=$1 AND expires_at>now() AND alishan_private.has_google_login_invite(subject::uuid)', [hash(token)]);
      return result.rows[0]?.subject;
    },
    async remove(token) {
      await pool.query('DELETE FROM alishan_private.login_sessions WHERE token_hash=$1', [hash(token)]);
    }
  };
}

function googleLogin({ supabaseUrl, publishableKey, origin, sessions, verifyOnly = false, request = fetch }) {
  const base = new URL('/auth/v1/', supabaseUrl);
  if (base.protocol !== 'https:' || new URL(origin).origin !== origin || !origin.startsWith('https:') || !publishableKey)
    throw new Error('Google login requires HTTPS APP_ORIGIN, SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
  const validSecret = value => /^[\w-]{43}$/.test(value || '');

  return {
    start(req, res) {
      const verifier = random();
      const url = new URL('authorize', base);
      url.search = new URLSearchParams({
        provider: 'google',
        redirect_to: origin + '/auth/callback',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 's256',
        prompt: 'select_account'
      });
      res.cookie(verifierName, verifier, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
      res.redirect(303, url.href);
    },
    async callback(req, res) {
      const verifier = cookie(req, verifierName);
      res.clearCookie(verifierName, cookieOptions);
      const fail = () => res.redirect(303, '/login?error=google');
      if (!validSecret(verifier) || typeof req.query.code !== 'string' || req.query.code.length > 512) return fail();
      try {
        const reply = await request(new URL('token?grant_type=pkce', base), {
          method: 'POST',
          headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_code: req.query.code, code_verifier: verifier }),
          signal: AbortSignal.timeout(10000)
        });
        if (!reply.ok) return fail();
        const { user } = await reply.json();
        if (!uuid.test(user?.id || '') || !user.app_metadata?.providers?.includes('google')) return fail();
        if(verifyOnly)return res.redirect(303, '/login?verified=google');
        const previous = cookie(req, sessionName);
        const token = random();
        if (await sessions.save(token, user.id, new Date(Date.now() + sessionLifetime)) === false) return fail();
        if (validSecret(previous)) await sessions.remove(previous);
        res.cookie(sessionName, token, { ...cookieOptions, maxAge: sessionLifetime });
        // Make the dashboard navigation originate here, after the cross-site OAuth redirect chain ends.
        res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Opening Alishan</title>
<meta name="color-scheme" content="light dark">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:1rem;background:#faf3f5;color:#351421;font:1rem system-ui,sans-serif}
body.dark{background:#000;color:#fff}main{width:min(100%,23rem);text-align:center;padding:2rem;border:1px solid #a37b8b80;border-radius:1.25rem}
h1{font-size:1.35rem;margin:0 0 .5rem}p{margin:0}a{color:inherit;display:inline-block;margin-top:1rem;padding:.6rem}
</style><body><script>try{if(!/^(light-default|light-warm|mint|rose-wine|gold)$/.test(localStorage.getItem('alishan-theme')||'light-default'))document.body.classList.add('dark');}catch{}</script>
<main><h1>Opening Alishan</h1><p role="status">Your Dashboard is loading…</p><a href="/">Open Dashboard</a></main>
<script>location.replace('/');</script></body></html>`);
      } catch {
        return fail();
      }
    },
    async authenticate(req, res, { documentNavigation = false } = {}) {
      const reject = reason => {
        if (documentNavigation || req.path === '/api/view-session') {
          res.set('X-Alishan-Session-Status', reason);
          console.info('Alishan session unavailable:', reason);
        }
        return null;
      };
      // A top-level link can open the app with an existing SameSite=Lax cookie.
      // Cross-site fetches and API calls still cannot use that session.
      if (req.get('sec-fetch-site') === 'cross-site' &&
          !(documentNavigation && req.get('sec-fetch-mode') === 'navigate' && req.get('sec-fetch-dest') === 'document'))
        return reject('cross-site-request');
      const token = cookie(req, sessionName);
      if (!validSecret(token)) return reject(token ? 'invalid-cookie' : 'cookie-missing');
      const subject = await sessions.get(token);
      return uuid.test(subject || '') ? subject : reject('session-unavailable');
    },
    async logout(req, res) {
      if (req.get('origin') !== origin) return res.sendStatus(403);
      const token = cookie(req, sessionName);
      if (validSecret(token)) await sessions.remove(token);
      res.clearCookie(sessionName, cookieOptions);
      res.set('Clear-Site-Data', '"cache", "storage"');
      res.redirect(303, '/login');
    }
  };
}

module.exports = { googleLogin, sessionStore };
