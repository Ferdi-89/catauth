import { NextResponse } from 'next/server';
import { ProtectedLink } from '../../../../lib/types';

// In-memory data store for Protected Links
export let protectedLinksStore: ProtectedLink[] = [
  {
    id: 'lnk_alpha_portal',
    title: 'Portal Karyawan Produksi',
    slug: 'portal-alpha',
    target_redirect_url: '/sso/callback',
    allowed_card_ids: ['FIDO2-NFC-KEY-ALPHA-01', 'FIDO2-NFC-KEY-BETA-02'],
    require_pin: false,
    geofence_enabled: true,
    allowed_countries: ['ID', 'SG', 'US'],
    is_active: true,
    total_taps: 124,
    successful_passes: 118,
    blocked_attempts: 6,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'lnk_secret_vault',
    title: 'Brankas Data VIP & API Keys',
    slug: 'vip-vault',
    target_redirect_url: 'https://catauth.io/admin/keys',
    allowed_card_ids: ['FIDO2-NFC-KEY-ALPHA-01'],
    require_pin: true,
    geofence_enabled: true,
    allowed_countries: ['ID'],
    is_active: true,
    total_taps: 45,
    successful_passes: 41,
    blocked_attempts: 4,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

export async function GET() {
  return NextResponse.json({
    success: true,
    data: protectedLinksStore,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = body.title || 'Link Gateway Baru';
  const slug = (body.slug || title.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/-+/g, '-');
  const id = `lnk_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const newLink: ProtectedLink = {
    id,
    title,
    slug,
    target_redirect_url: body.target_redirect_url || '/sso/callback',
    allowed_card_ids: Array.isArray(body.allowed_card_ids) && body.allowed_card_ids.length > 0 
      ? body.allowed_card_ids 
      : ['FIDO2-NFC-KEY-ALPHA-01'],
    require_pin: Boolean(body.require_pin),
    geofence_enabled: body.geofence_enabled !== undefined ? Boolean(body.geofence_enabled) : true,
    allowed_countries: body.allowed_countries || ['ID', 'SG', 'US'],
    is_active: true,
    total_taps: 0,
    successful_passes: 0,
    blocked_attempts: 0,
    created_at: new Date().toISOString(),
  };

  protectedLinksStore.unshift(newLink);

  return NextResponse.json({
    success: true,
    data: newLink,
    message: 'Protected Link created successfully with NFC card whitelist.',
  });
}
