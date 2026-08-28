import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const { credential_id, redirect_uri, client_id, state, nonce } = body;

  // Handle simulation scenarios based on credential_id
  if (credential_id === 'FIDO2-NFC-KEY-REVOKED-03' || credential_id?.includes('REVOKED')) {
    return NextResponse.json({
      success: true,
      data: {
        status: 'BLOCKED',
        error_message: 'Kunci keamanan hardware FIDO2 NFC telah dicabut oleh Administrator (Node 19 & 20).',
      },
      message: 'Revoked card blocked.',
    });
  }

  if (credential_id === 'FIDO2-NFC-KEY-CLONED-99' || credential_id?.includes('CLONED')) {
    return NextResponse.json({
      success: true,
      data: {
        status: 'INVALID',
        error_message: 'Deteksi anomali: Counter sign_count mundur/sama dengan nilai tersimpan (Percobaan Kloning Token - Node 21 & 22).',
      },
      message: 'Cloned token detected.',
    });
  }

  // Generate single-use authorization code
  const code = `authcode_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  const baseRedirect = redirect_uri || '/sso/callback';
  const delimiter = baseRedirect.includes('?') ? '&' : '?';
  const finalRedirect = `${baseRedirect}${delimiter}code=${code}&state=${state || 'demo_state'}`;

  return NextResponse.json({
    success: true,
    data: {
      status: 'SUCCESS',
      auth_code: code,
      redirect_target: finalRedirect,
      user_id: 'usr_demo_john_doe',
      auth_method: 'WEBAUTHN_NFC',
    },
    message: 'WebAuthn assertion verified, anti-cloning passed, single-use auth code issued (Nodes 28-33).',
  });
}
