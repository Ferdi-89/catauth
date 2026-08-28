import { NextResponse } from 'next/server';

let breakers = [
  {
    name: 'webhook_client_portal_alpha',
    state: 'CLOSED' as const,
    failure_count: 0,
    fail_max: 3,
    reset_timeout_seconds: 60,
    time_in_current_state_seconds: 120,
    is_available: true,
  },
  {
    name: 'webhook_client_dashboard_beta',
    state: 'CLOSED' as const,
    failure_count: 0,
    fail_max: 3,
    reset_timeout_seconds: 60,
    time_in_current_state_seconds: 90,
    is_available: true,
  },
];

export async function GET() {
  return NextResponse.json({
    success: true,
    data: breakers,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { client_id, state } = body;
  breakers = breakers.map((b) => b.name.includes(client_id) ? { ...b, state } : b);
  return NextResponse.json({
    success: true,
    message: `Circuit breaker state overridden to ${state} (Node 64).`,
  });
}
