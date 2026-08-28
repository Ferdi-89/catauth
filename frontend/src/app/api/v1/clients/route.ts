import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [
      {
        id: 'cl_01',
        client_id: 'client_portal_alpha',
        app_name: 'Portal Mitra Alpha',
        app_logo_url: '',
        redirect_uris: ['/sso/callback', 'http://localhost:3000/sso/callback', 'https://catauth.vercel.app/sso/callback'],
        allowed_origins: ['*'],
        webhook_logout_url: 'https://webhook.site/alpha-logout',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'cl_02',
        client_id: 'client_dashboard_beta',
        app_name: 'Enterprise Analytics Beta',
        app_logo_url: '',
        redirect_uris: ['/sso/callback', 'http://localhost:3000/sso/callback'],
        allowed_origins: ['*'],
        webhook_logout_url: 'https://webhook.site/beta-logout',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ],
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const rawSecret = `sec_${Math.random().toString(36).substring(2, 16)}`;
  return NextResponse.json({
    success: true,
    data: {
      id: `cl_${Date.now()}`,
      client_id: body.client_id,
      client_secret_raw: rawSecret,
      app_name: body.app_name,
      redirect_uris: body.redirect_uris,
      allowed_origins: body.allowed_origins,
      webhook_logout_url: body.webhook_logout_url,
      is_active: true,
    },
    message: 'Client App created successfully (Node 49-51).',
  });
}
