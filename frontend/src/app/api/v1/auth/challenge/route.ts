import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const nonce = `ch_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  return NextResponse.json({
    success: true,
    data: {
      challenge: nonce,
      rp_id: 'catauth.io',
      rp_name: 'Catauth Sovereign Identity',
      timeout_ms: 60000,
      user_verification: 'preferred',
    },
    message: 'Transient challenge nonce issued with 60s TTL (Nodes 8 & 9).',
  });
}
