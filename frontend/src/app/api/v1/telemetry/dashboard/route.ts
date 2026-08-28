import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      total_authentications: 1248,
      success_authentications: 1215,
      failed_authentications: 33,
      success_rate: 97.35,
      active_sessions: 42,
      dlq_pending_count: 0,
      countries: [
        { country: 'ID', count: 850 },
        { country: 'SG', count: 210 },
        { country: 'US', count: 95 },
        { country: 'JP', count: 60 },
        { country: 'MY', count: 33 },
      ],
      recent_logs: [
        {
          id: 'log_01',
          event_type: 'SSO_LOGIN_SUCCESS',
          client_id: 'client_portal_alpha',
          ip_address: '114.122.34.19',
          country_code: 'ID',
          status: 'SUCCESS',
          created_at: new Date().toISOString(),
        },
        {
          id: 'log_02',
          event_type: 'FIDO2_ASSERTION_VERIFIED',
          client_id: 'client_portal_alpha',
          ip_address: '114.122.34.19',
          country_code: 'ID',
          status: 'SUCCESS',
          created_at: new Date(Date.now() - 45000).toISOString(),
        },
      ],
      timestamp: new Date().toISOString(),
    },
  });
}
