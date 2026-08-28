import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const { pin, temp_session_id } = body;

  if (pin !== '123456') {
    return NextResponse.json({
      success: false,
      error: {
        code: 'INVALID_PIN',
        message: 'PIN Argon2id tidak sesuai. Silakan coba lagi (Node 27).',
      },
    }, { status: 400 });
  }

  const code = `authcode_pin_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  return NextResponse.json({
    success: true,
    data: {
      auth_code: code,
      redirect_target: `/sso/callback?code=${code}&state=demo_state_pin`,
    },
    message: 'Argon2id PIN verified successfully (Node 26 & 28).',
  });
}
