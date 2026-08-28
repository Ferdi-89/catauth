import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');

  if (!clientId || (!clientId.startsWith('client_') && clientId !== 'demo_client')) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'INVALID_CLIENT',
        message: 'Client ID tidak ditemukan atau belum terdaftar dalam whitelist RP.',
      },
    }, { status: 400 });
  }

  // Valid client response (Nodes 1-4)
  return NextResponse.json({
    success: true,
    data: {
      client_id: clientId,
      app_name: clientId === 'client_dashboard_beta' ? 'Enterprise Analytics Beta' : 'Portal Mitra Alpha',
      rp_id: 'catauth.io',
      allowed_origins: ['*'],
      redirect_uris: [redirectUri || ''],
    },
    message: 'Client app validated successfully (Node 3: True).',
  });
}
