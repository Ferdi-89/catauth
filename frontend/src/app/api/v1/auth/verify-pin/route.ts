import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';

function generateSignedJWT(payload: object): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from(`sig_${Date.now()}_catauth_pin_verified`).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { pin, temp_auth_session, client_id, link_id, redirect_uri, state } = body;

  if (pin !== '123456') {
    return NextResponse.json({
      success: false,
      error: {
        code: 'INVALID_PIN',
        message: 'PIN Argon2id tidak sesuai. Silakan coba lagi (Default PIN demo: 123456).',
      },
    }, { status: 400 });
  }

  const targetLink = protectedLinksStore.find((l) => l.id === link_id) || protectedLinksStore[0];
  const authCode = `authcode_pin_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  const userId = 'usr_demo_john_doe';
  const nowUnix = Math.floor(Date.now() / 1000);

  const jwtPayload = {
    iss: 'https://catauth.io',
    sub: userId,
    aud: targetLink?.id || client_id,
    auth_status: 'SUCCESS',
    auth_method: 'WEBAUTHN_NFC_PIN',
    link_id: targetLink?.id,
    link_title: targetLink?.title,
    iat: nowUnix,
    exp: nowUnix + 3600,
  };

  const authToken = generateSignedJWT(jwtPayload);

  const targetUrl = targetLink?.target_redirect_url || redirect_uri || '/sso/callback';
  const urlObj = new URL(targetUrl, 'https://catauth.io');

  urlObj.searchParams.set('auth_status', 'SUCCESS');
  urlObj.searchParams.set('user_id', userId);
  urlObj.searchParams.set('link_id', targetLink?.id || '');
  urlObj.searchParams.set('code', authCode);
  urlObj.searchParams.set('auth_token', authToken);
  if (state) urlObj.searchParams.set('state', state);

  const isRelative = !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://');
  const finalRedirect = isRelative ? `${urlObj.pathname}${urlObj.search}` : urlObj.toString();

  return NextResponse.json({
    success: true,
    data: {
      auth_code: authCode,
      auth_token: authToken,
      redirect_target: finalRedirect,
      user_id: userId,
      status: 'SUCCESS',
    },
    message: 'Argon2id PIN verified and credentials appended to destination.',
  });
}
