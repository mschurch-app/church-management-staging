const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return respond({ error: 'method_not_allowed' }, 405);
  }

  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization) || authorization.length > 8192) {
    return respond({ error: 'invalid_token' }, 401);
  }

  try {
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { authorization },
    });

    if (!profileResponse.ok) {
      return respond({ error: 'invalid_token' }, 401);
    }

    const profile = await profileResponse.json();
    const subject = typeof profile.userId === 'string' ? profile.userId : '';
    if (!/^U[0-9a-f]{32}$/.test(subject)) {
      return respond({ error: 'invalid_profile' }, 502);
    }

    return respond({
      sub: subject,
      name: typeof profile.displayName === 'string' ? profile.displayName.slice(0, 100) : 'LINE 使用者',
      picture: typeof profile.pictureUrl === 'string' ? profile.pictureUrl : undefined,
    });
  } catch {
    return respond({ error: 'profile_unavailable' }, 502);
  }
});
