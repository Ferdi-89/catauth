import { NextResponse } from 'next/server';

let policiesData = {
  id: 'pol_global',
  session_ttl_sec: 3600,
  challenge_ttl_sec: 60,
  require_pin_mfa: false,
  geofence_enabled: true,
  allowed_countries: ['ID', 'SG', 'US', 'JP', 'MY', 'GB', 'DE'],
};

export async function GET() {
  return NextResponse.json({
    success: true,
    data: policiesData,
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  policiesData = { ...policiesData, ...body };
  return NextResponse.json({
    success: true,
    data: policiesData,
    message: 'Policies updated successfully (Node 57 & 58).',
  });
}
