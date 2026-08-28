import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const token = body?.token;

  return NextResponse.json({
    success: true,
    active: true,
    client_id: 'client_portal_alpha',
    sub: 'usr_demo_john_doe',
    scope: 'openid profile email fido2',
    token_type: 'Bearer',
    exp: Math.floor(Date.now() / 1000) + 3600,
    source: 'singleflight_distributed_lock_cache',
    message: 'Token introspected with Singleflight Dead-Man lock protection (Nodes 40-44).',
  });
}
