import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [
      {
        id: 'cred_01',
        user_id: 'usr_demo_john_doe',
        credential_id: 'FIDO2-NFC-KEY-ALPHA-01',
        label: 'YubiKey 5 NFC (Alpha Key)',
        sign_count: 0,
        transports: ['nfc', 'usb'],
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'cred_02',
        user_id: 'usr_demo_john_doe',
        credential_id: 'FIDO2-NFC-KEY-BETA-02',
        label: 'Feitian ePass FIDO2 (Beta Key)',
        sign_count: 42,
        transports: ['nfc'],
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'cred_03',
        user_id: 'usr_demo_john_doe',
        credential_id: 'FIDO2-NFC-KEY-REVOKED-03',
        label: 'Compromised Token (Test Revoked)',
        sign_count: 105,
        transports: ['nfc'],
        is_active: false,
        revocation_reason: 'Admin security revocation test',
        revoked_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
  });
}
