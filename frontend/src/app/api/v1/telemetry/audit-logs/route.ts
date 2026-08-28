import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    success: true,
    data: [
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
        created_at: new Date(Date.now() - 60000).toISOString(),
      },
      {
        id: 'log_03',
        event_type: 'CLONED_TOKEN_ANOMALY_BLOCKED',
        client_id: 'client_portal_alpha',
        ip_address: '185.220.101.5',
        country_code: 'DE',
        status: 'SECURITY_BLOCKED',
        created_at: new Date(Date.now() - 180000).toISOString(),
      },
    ],
  });
}
