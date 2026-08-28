import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';

// Global mock audit logs
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

export async function POST(request: Request) {
  const body = await request.json();
  const { credential_id, redirect_uri, client_id, link_id, state, nonce } = body;

  // Find targeted link
  const targetLink = protectedLinksStore.find((l) => l.id === link_id || l.slug === link_id) || protectedLinksStore[0];

  // 1. Check if card is revoked
  if (credential_id === 'FIDO2-NFC-KEY-REVOKED-03' || credential_id?.includes('REVOKED')) {
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
      card_label: 'Compromised Token (Revoked)',
      ip_address: '114.122.34.19',
      country: 'ID',
      status: 'SECURITY_BLOCKED',
      created_at: new Date().toISOString(),
    });
    return NextResponse.json({
      success: true,
      data: {
        status: 'BLOCKED',
        error_message: 'Kunci keamanan hardware FIDO2 NFC telah dicabut oleh Administrator (Node 19 & 20).',
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
    const isCardAllowed = targetLink.allowed_card_ids.includes(credential_id);
    if (!isCardAllowed) {
      targetLink.total_taps += 1;
      targetLink.blocked_attempts += 1;

      auditLogsStore.unshift({
        id: `log_${Date.now()}`,
        event_type: 'UNAUTHORIZED_CARD_FOR_LINK',
        link_id: targetLink.id,
        link_title: targetLink.title,
        card_id: credential_id,
        card_label: credential_id === 'FIDO2-NFC-KEY-BETA-02' ? 'Feitian ePass (Beta Key)' : 'Kartu NFC Tidak Dikenal',
        ip_address: '114.122.34.19',
        country: 'ID',
        status: 'SECURITY_BLOCKED',
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        data: {
          status: 'UNAUTHORIZED_CARD',
          error_message: `Akses Ditolak: Kartu NFC "${credential_id}" tidak terdaftar dalam whitelist link "${targetLink.title}".`,
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

  auditLogsStore.unshift({
    id: `log_${Date.now()}`,
    event_type: 'SSO_LOGIN_SUCCESS',
    link_id: targetLink?.id,
    link_title: targetLink?.title,
    card_id: credential_id,
    card_label: credential_id === 'FIDO2-NFC-KEY-ALPHA-01' ? 'YubiKey 5 NFC (Alpha Key)' : 'Feitian ePass (Beta Key)',
    ip_address: '114.122.34.19',
    country: 'ID',
    status: 'SUCCESS',
    created_at: new Date().toISOString(),
  });

  // Generate single-use authorization code
  const code = `authcode_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  const targetUrl = targetLink?.target_redirect_url || redirect_uri || '/sso/callback';
  const delimiter = targetUrl.includes('?') ? '&' : '?';
  const finalRedirect = `${targetUrl}${delimiter}code=${code}&state=${state || 'demo_state'}&link_id=${targetLink?.id || ''}`;

  return NextResponse.json({
    success: true,
    data: {
      status: 'SUCCESS',
      auth_code: code,
      redirect_target: finalRedirect,
      user_id: 'usr_demo_john_doe',
      auth_method: 'WEBAUTHN_NFC',
      link_title: targetLink?.title,
    },
    message: `WebAuthn assertion verified and authorized for link "${targetLink?.title}".`,
  });
}
