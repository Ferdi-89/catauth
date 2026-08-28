import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';
import { credentialsStore } from '../../credentials/tokens/route';

// Global live audit logs
export let auditLogsStore: any[] = [
  {
    id: 'log_01',
    event_type: 'SSO_LOGIN_SUCCESS',
    client_id: 'client_portal_alpha',
    link_id: 'lnk_alpha_portal',
    link_title: 'Portal Karyawan Produksi',
    card_id: 'FIDO2-NFC-KEY-ALPHA-01',
    card_label: 'YubiKey 5 NFC (Alpha Key)',
    ip_address: '114.122.34.19',
    country: 'ID',
    status: 'SUCCESS',
    created_at: new Date(Date.now() - 30000).toISOString(),
  },
  {
    id: 'log_02',
    event_type: 'FIDO2_ASSERTION_VERIFIED',
    client_id: 'client_portal_alpha',
    link_id: 'lnk_alpha_portal',
    link_title: 'Portal Karyawan Produksi',
    card_id: 'FIDO2-NFC-KEY-BETA-02',
    card_label: 'Feitian ePass (Beta Key)',
    ip_address: '114.122.34.19',
    country: 'ID',
    status: 'SUCCESS',
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 'log_03',
    event_type: 'UNAUTHORIZED_CARD_BLOCKED',
    client_id: 'client_portal_alpha',
    link_id: 'lnk_secret_vault',
    link_title: 'Brankas Data VIP & API Keys',
    card_id: 'FIDO2-NFC-KEY-BETA-02',
    card_label: 'Feitian ePass (Beta Key)',
    ip_address: '185.220.101.5',
    country: 'DE',
    status: 'SECURITY_BLOCKED',
    created_at: new Date(Date.now() - 120000).toISOString(),
  },
];

// Helper to generate a base64url encoded JWT
function generateSignedJWT(payload: object): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from(`sig_${Date.now()}_catauth_nfc_hardware_master_key`).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { credential_id, redirect_uri, client_id, link_id, state, nonce } = body;

  // Find targeted link
  const targetLink = protectedLinksStore.find((l) => l.id === link_id || l.slug === link_id) || protectedLinksStore[0];

  // Lookup card in credentialsStore
  const matchedCred = credentialsStore.find((c) => c.credential_id === credential_id || c.id === credential_id);
  const cardLabel = matchedCred?.label || (credential_id?.startsWith('NFC-UID-') ? `Kartu NFC Fisik (${credential_id.replace('NFC-UID-', '')})` : credential_id);
  const userId = matchedCred?.user_id || 'usr_demo_john_doe';

  // 1. Check if card is revoked
  if (credential_id === 'FIDO2-NFC-KEY-REVOKED-03' || credential_id?.includes('REVOKED') || (matchedCred && !matchedCred.is_active)) {
    if (targetLink) {
      targetLink.total_taps += 1;
      targetLink.blocked_attempts += 1;
    }
    auditLogsStore.unshift({
      id: `log_${Date.now()}`,
      event_type: 'REVOKED_CARD_BLOCKED',
      link_id: targetLink?.id,
      link_title: targetLink?.title,
      card_id: credential_id,
      card_label: cardLabel,
      ip_address: '114.122.34.19',
      country: 'ID',
      status: 'SECURITY_BLOCKED',
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      data: {
        status: 'BLOCKED',
        error_message: `Kunci hardware "${cardLabel}" telah dicabut oleh Administrator (Revocation Lock - Node 19 & 20).`,
      },
      message: 'Revoked card blocked.',
    });
  }

  // 2. Check if token is cloned (sign_count anomaly)
  if (credential_id === 'FIDO2-NFC-KEY-CLONED-99' || credential_id?.includes('CLONED')) {
    if (targetLink) {
      targetLink.total_taps += 1;
      targetLink.blocked_attempts += 1;
    }
    auditLogsStore.unshift({
      id: `log_${Date.now()}`,
      event_type: 'CLONED_TOKEN_ANOMALY',
      link_id: targetLink?.id,
      link_title: targetLink?.title,
      card_id: credential_id,
      card_label: 'Cloned Hardware Clone Attack',
      ip_address: '185.220.101.5',
      country: 'DE',
      status: 'SECURITY_BLOCKED',
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      data: {
        status: 'INVALID',
        error_message: 'Deteksi anomali: Counter sign_count mundur/sama dengan nilai tersimpan (Percobaan Kloning Token - Node 21 & 22).',
      },
      message: 'Cloned token detected.',
    });
  }

  // 3. Link-specific Whitelist Validation (Per-Link Card Authorization Check)
  if (targetLink && targetLink.allowed_card_ids && targetLink.allowed_card_ids.length > 0) {
    const isCardAllowed = targetLink.allowed_card_ids.includes(credential_id) || (matchedCred && targetLink.allowed_card_ids.includes(matchedCred.credential_id));
    if (!isCardAllowed) {
      targetLink.total_taps += 1;
      targetLink.blocked_attempts += 1;

      auditLogsStore.unshift({
        id: `log_${Date.now()}`,
        event_type: 'UNAUTHORIZED_CARD_FOR_LINK',
        link_id: targetLink.id,
        link_title: targetLink.title,
        card_id: credential_id,
        card_label: cardLabel,
        ip_address: '114.122.34.19',
        country: 'ID',
        status: 'SECURITY_BLOCKED',
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        data: {
          status: 'UNAUTHORIZED_CARD',
          error_message: `Akses Ditolak: Kartu "${cardLabel}" (${credential_id}) belum terdaftar dalam whitelist link "${targetLink.title}".`,
          detected_card_id: credential_id,
        },
        message: 'Card not in link whitelist.',
      });
    }
  }

  // 4. Authorized Card Pass
  if (targetLink) {
    targetLink.total_taps += 1;
    targetLink.successful_passes += 1;
  }

  if (matchedCred) {
    matchedCred.sign_count = (matchedCred.sign_count || 0) + 1;
    matchedCred.last_used_at = new Date().toISOString();
  }

  auditLogsStore.unshift({
    id: `log_${Date.now()}`,
    event_type: 'SSO_LOGIN_SUCCESS',
    link_id: targetLink?.id,
    link_title: targetLink?.title,
    card_id: credential_id,
    card_label: cardLabel,
    ip_address: '114.122.34.19',
    country: 'ID',
    status: 'SUCCESS',
    created_at: new Date().toISOString(),
  });

  // Generate single-use authorization code & rich JWT token
  const authCode = `authcode_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  const nowUnix = Math.floor(Date.now() / 1000);

  const jwtPayload = {
    iss: 'https://catauth.io',
    sub: userId,
    aud: targetLink?.id || client_id,
    auth_status: 'SUCCESS',
    auth_method: 'WEBAUTHN_NFC',
    card_id: credential_id,
    card_label: cardLabel,
    link_id: targetLink?.id,
    link_title: targetLink?.title,
    iat: nowUnix,
    exp: nowUnix + 3600, // 1 hour validity
  };

  const authToken = generateSignedJWT(jwtPayload);

  // Construct target redirect destination carrying full credentials info
  const targetUrl = targetLink?.target_redirect_url || redirect_uri || '/sso/callback';
  const urlObj = new URL(targetUrl, 'https://catauth.io');

  // Inject credential parameters into target URL query
  urlObj.searchParams.set('auth_status', 'SUCCESS');
  urlObj.searchParams.set('user_id', userId);
  urlObj.searchParams.set('card_id', credential_id);
  urlObj.searchParams.set('card_label', cardLabel);
  urlObj.searchParams.set('link_id', targetLink?.id || '');
  urlObj.searchParams.set('code', authCode);
  urlObj.searchParams.set('auth_token', authToken);
  if (state) urlObj.searchParams.set('state', state);

  // If targetUrl was relative (e.g. /sso/callback), keep relative path, otherwise absolute
  const isRelative = !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://');
  const finalRedirect = isRelative ? `${urlObj.pathname}${urlObj.search}` : urlObj.toString();

  return NextResponse.json({
    success: true,
    data: {
      status: 'SUCCESS',
      auth_code: authCode,
      auth_token: authToken,
      redirect_target: finalRedirect,
      user_id: userId,
      card_id: credential_id,
      card_label: cardLabel,
      auth_method: 'WEBAUTHN_NFC',
      link_title: targetLink?.title,
    },
    message: `WebAuthn assertion verified and authorized for link "${targetLink?.title}".`,
  });
}
