'use strict';

const { createHash, randomBytes } = require('node:crypto');
const sessionName = '__Host-alishan-session';
const verifierName = '__Host-alishan-pkce';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
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
        if (validSecret(previous)) await sessions.remove(previous);
        const token = random();
        if (await sessions.save(token, user.id, new Date(Date.now() + sessionLifetime)) === false) return fail();
        res.cookie(sessionName, token, { ...cookieOptions, maxAge: sessionLifetime });
        // Make the dashboard navigation originate here, after the cross-site OAuth redirect chain ends.
        res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Opening Alishan</title>
<p>Sign-in complete. <a href="/">Open Alishan Dashboard</a></p>
<script>location.replace('/');</script></html>`);
      } catch {
        return fail();
      }
    },
    async authenticate(req) {
      if (req.get('sec-fetch-site') === 'cross-site') return null;
      const token = cookie(req, sessionName);
      if (!validSecret(token)) return null;
      const subject = await sessions.get(token);
      return uuid.test(subject || '') ? subject : null;
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
