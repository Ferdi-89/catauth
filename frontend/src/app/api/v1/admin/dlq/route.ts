import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [
      {
        id: 'dlq_01',
        client_id: 'client_dashboard_beta',
        target_url: 'https://webhook.site/beta-logout',
        payload: { event: 'SESSION_REVOKED', user_id: 'usr_demo_john_doe' },
        retry_count: 3,
        last_error: 'HTTP 504 Gateway Timeout on remote server',
        status: 'PENDING',
        created_at: new Date(Date.now() - 300000).toISOString(),
      },
    ],
  });
}
