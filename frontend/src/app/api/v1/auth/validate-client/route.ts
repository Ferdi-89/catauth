import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get('link_id');
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');

  // Check if validating by link_id
  if (linkId) {
    const link = protectedLinksStore.find((l) => l.id === linkId || l.slug === linkId);
    if (!link) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'LINK_NOT_FOUND',
          message: `Link Akses Terproteksi "${linkId}" tidak ditemukan atau telah dicabut oleh Administrator.`,
        },
      }, { status: 404 });
    }

    if (!link.is_active) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'LINK_PAUSED',
          message: `Link Akses "${link.title}" sedang dinonaktifkan sementara oleh Administrator.`,
        },
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        link_id: link.id,
        app_name: link.title,
        target_redirect_url: link.target_redirect_url,
        allowed_card_ids: link.allowed_card_ids,
        require_pin: link.require_pin,
        geofence_enabled: link.geofence_enabled,
        allowed_countries: link.allowed_countries,
        rp_id: 'catauth.io',
        allowed_origins: ['*'],
        redirect_uris: [link.target_redirect_url],
      },
      message: `Protected Link "${link.title}" loaded successfully.`,
    });
  }

  // Fallback / legacy client_id lookup
  const targetClientId = clientId || 'client_portal_alpha';
  const defaultLink = protectedLinksStore[0];

  return NextResponse.json({
    success: true,
    data: {
      client_id: targetClientId,
      link_id: defaultLink?.id || 'lnk_alpha_portal',
      app_name: targetClientId === 'client_dashboard_beta' ? 'Enterprise Analytics Beta' : (defaultLink?.title || 'Portal Mitra Alpha'),
      target_redirect_url: defaultLink?.target_redirect_url || redirectUri || '/sso/callback',
      allowed_card_ids: defaultLink?.allowed_card_ids || ['FIDO2-NFC-KEY-ALPHA-01', 'FIDO2-NFC-KEY-BETA-02'],
      require_pin: defaultLink?.require_pin || false,
      geofence_enabled: true,
      allowed_countries: ['ID', 'SG', 'US'],
      rp_id: 'catauth.io',
      allowed_origins: ['*'],
      redirect_uris: [redirectUri || '/sso/callback'],
    },
    message: 'Client app validated successfully.',
  });
}
