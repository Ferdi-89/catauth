import { NextResponse } from 'next/server';
import { auditLogsStore } from '../../auth/assertion/route';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get('link_id');

  let logs = auditLogsStore;
  if (linkId && linkId !== 'all') {
    logs = auditLogsStore.filter((l) => l.link_id === linkId);
  }

  return NextResponse.json({
    success: true,
    data: logs,
  });
}
