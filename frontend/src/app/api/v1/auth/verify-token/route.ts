import { NextResponse } from 'next/server';

function corsResponse(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({ success: true });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = body.token || body.auth_token;

    if (!token) {
      return corsResponse({
        success: false,
        valid: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Parameter "token" / "auth_token" wajib disertakan.',
        },
      }, 400);
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return corsResponse({
        success: false,
        valid: false,
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'Format JWT token tidak valid.',
        },
      }, 400);
    }

    const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadRaw);

    const nowUnix = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowUnix) {
      return corsResponse({
        success: false,
        valid: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token otentikasi telah kadaluarsa.',
        },
      }, 401);
    }

    return corsResponse({
      success: true,
      valid: true,
      claims: payload,
      user: {
        user_id: payload.sub,
        card_id: payload.card_id,
        card_label: payload.card_label,
        link_id: payload.link_id,
        auth_method: payload.auth_method,
      },
      message: 'Token otentikasi valid dan terverifikasi.',
    });
  } catch (err: any) {
    return corsResponse({
      success: false,
      valid: false,
      error: {
        code: 'TOKEN_VERIFICATION_FAILED',
        message: err.message || 'Gagal memverifikasi token.',
      },
    }, 400);
  }
}
