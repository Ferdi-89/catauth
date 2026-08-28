import { NextResponse } from 'next/server';
import { FIDO2Credential } from '../../../../../lib/types';
import { db, isSupabaseConfigured } from '../../../../../lib/supabase';

export let credentialsStore: FIDO2Credential[] = [
  {
    id: 'cred_01',
    user_id: 'usr_ferdi_admin',
    user_name: 'Ferdi Pratama',
    user_email: 'ferdi@catauth.io',
    user_role: 'ADMIN',
    credential_id: 'FIDO2-NFC-KEY-ALPHA-01',
    label: 'YubiKey 5 NFC (Alpha Key)',
    sign_count: 0,
    transports: ['nfc', 'usb'],
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'cred_02',
    user_id: 'usr_staff_budi',
    user_name: 'Budi Santoso',
    user_email: 'budi@catauth.io',
    user_role: 'STAFF',
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
    user_name: 'Compromised Token',
    user_email: 'revoked@catauth.io',
    user_role: 'OPERATOR',
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
  if (isSupabaseConfigured()) {
    const sbData = await db.getCredentials();
    if (sbData && sbData.length > 0) {
      credentialsStore = sbData;
      return NextResponse.json({
        success: true,
        data: sbData,
        source: 'supabase',
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: credentialsStore,
    source: 'in_memory',
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const label = body.label || 'Kunci Hardware FIDO2 NFC Baru';
  const credId = body.credential_id || `FIDO2-NFC-${Date.now().toString(36).toUpperCase()}`;

  // Rehydrate first
  if (isSupabaseConfigured()) {
    const sbData = await db.getCredentials();
    if (sbData && sbData.length > 0) {
      credentialsStore = sbData;
    }
  }

  // Check duplicate
  const existing = credentialsStore.find((c) => c.credential_id === credId || c.id === credId);
  if (existing) {
    // Update existing
    existing.label = label;
    existing.user_id = body.user_id || existing.user_id;
    existing.user_name = body.user_name || existing.user_name || label;
    existing.user_email = body.user_email || existing.user_email;
    existing.user_role = body.user_role || existing.user_role;

    if (isSupabaseConfigured()) {
      await db.insertCredential(existing);
    }

    return NextResponse.json({
      success: true,
      data: existing,
      source: isSupabaseConfigured() ? 'supabase' : 'in_memory',
      message: `Data akun kunci "${label}" berhasil diperbarui.`,
    });
  }

  const newCred: FIDO2Credential = {
    id: body.id || `cred_${Date.now()}`,
    user_id: body.user_id || 'usr_ferdi_admin',
    user_name: body.user_name || label,
    user_email: body.user_email || `${body.user_id || 'ferdi'}@catauth.io`,
    user_role: body.user_role || 'ADMIN',
    credential_id: credId,
    label,
    sign_count: body.sign_count || 0,
    aaguid: body.aaguid,
    transports: body.transports || ['nfc', 'usb', 'internal'],
    is_active: true,
    created_at: new Date().toISOString(),
  };

  credentialsStore.push(newCred);

  if (isSupabaseConfigured()) {
    await db.insertCredential(newCred);
  }

  return NextResponse.json({
    success: true,
    data: newCred,
    source: isSupabaseConfigured() ? 'supabase' : 'in_memory',
    message: `Kunci hardware "${label}" berhasil didaftarkan ke akun ${newCred.user_name}.`,
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { credential_id, user_id, user_name, user_email, user_role, label } = body;

  // Rehydrate first to prevent serverless cold-start misses
  if (isSupabaseConfigured()) {
    const sbData = await db.getCredentials();
    if (sbData && sbData.length > 0) {
      credentialsStore = sbData;
    }
  }

  let target = credentialsStore.find(
    (c) => c.credential_id === credential_id || c.id === credential_id || c.credential_id === decodeURIComponent(credential_id)
  );

  // If still not found in store, create/upsert it gracefully
  if (!target) {
    target = {
      id: `cred_${Date.now()}`,
      user_id: user_id || 'usr_ferdi_admin',
      user_name: user_name || label || 'Ferdi Pratama',
      user_email: user_email || `${user_id || 'ferdi'}@catauth.io`,
      user_role: user_role || 'ADMIN',
      credential_id: credential_id,
      label: label || `Kartu (${credential_id})`,
      sign_count: 0,
      transports: ['nfc'],
      is_active: true,
      created_at: new Date().toISOString(),
    };
    credentialsStore.push(target);
  } else {
    if (user_id) target.user_id = user_id;
    if (user_name) target.user_name = user_name;
    if (user_email) target.user_email = user_email;
    if (user_role) target.user_role = user_role;
    if (label) target.label = label;
  }

  if (isSupabaseConfigured()) {
    await db.insertCredential(target);
  }

  return NextResponse.json({
    success: true,
    data: target,
    source: isSupabaseConfigured() ? 'supabase' : 'in_memory',
    message: `Profil akun pemilik kartu "${target.label}" berhasil diperbarui.`,
  });
}
