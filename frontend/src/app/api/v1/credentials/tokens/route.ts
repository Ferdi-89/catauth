import { NextResponse } from 'next/server';
import { FIDO2Credential } from '../../../../lib/types';

export let credentialsStore: FIDO2Credential[] = [
  {
    id: 'cred_01',
    user_id: 'usr_demo_john_doe',
    credential_id: 'FIDO2-NFC-KEY-ALPHA-01',
    label: 'YubiKey 5 NFC (Alpha Key)',
    sign_count: 0,
    transports: ['nfc', 'usb'],
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'cred_02',
    user_id: 'usr_demo_john_doe',
    credential_id: 'FIDO2-NFC-KEY-BETA-02',
    label: 'Feitian ePass FIDO2 (Beta Key)',
    sign_count: 42,
    transports: ['nfc'],
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
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
    revoked_at: new Date(Date.now() - 86400000).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

export async function GET() {
  return NextResponse.json({
    success: true,
    data: credentialsStore,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const label = body.label || 'Kunci Hardware FIDO2 NFC Baru';
  const credId = body.credential_id || `FIDO2-NFC-${Date.now().toString(36).toUpperCase()}`;

  // Check duplicate
  const existing = credentialsStore.find((c) => c.credential_id === credId);
  if (existing) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'DUPLICATE_CREDENTIAL',
        message: `Kredensial dengan ID "${credId}" sudah terdaftar sebelumnya.`,
      },
    }, { status: 400 });
  }

  const newCred: FIDO2Credential = {
    id: `cred_${Date.now()}`,
    user_id: body.user_id || 'usr_demo_john_doe',
    credential_id: credId,
    label,
    sign_count: body.sign_count || 0,
    aaguid: body.aaguid,
    transports: body.transports || ['nfc', 'usb', 'internal'],
    is_active: true,
    created_at: new Date().toISOString(),
  };

  credentialsStore.push(newCred);

  return NextResponse.json({
    success: true,
    data: newCred,
    message: `Kunci hardware "${label}" berhasil didaftarkan ke sistem.`,
  });
}
