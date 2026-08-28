import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';
import { auditLogsStore } from '../../auth/assertion/route';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get('link_id');

  let filteredLogs = auditLogsStore;
  let targetLink = null;

  if (linkId && linkId !== 'all') {
    targetLink = protectedLinksStore.find((l) => l.id === linkId || l.slug === linkId);
    filteredLogs = auditLogsStore.filter((l) => l.link_id === linkId || (targetLink && l.link_id === targetLink.id));
  }

  // Calculate stats based on link or total
  const totalAuth = targetLink 
    ? targetLink.total_taps 
    : protectedLinksStore.reduce((acc, l) => acc + l.total_taps, 1248);

  const successAuth = targetLink
    ? targetLink.successful_passes
    : protectedLinksStore.reduce((acc, l) => acc + l.successful_passes, 1215);

  const failedAuth = targetLink
    ? targetLink.blocked_attempts
    : protectedLinksStore.reduce((acc, l) => acc + l.blocked_attempts, 33);

  const successRate = totalAuth > 0 ? Number(((successAuth / totalAuth) * 100).toFixed(2)) : 100;

  return NextResponse.json({
    success: true,
    data: {
      total_authentications: totalAuth,
      success_authentications: successAuth,
      failed_authentications: failedAuth,
      success_rate: successRate,
      active_sessions: targetLink ? Math.max(1, Math.floor(targetLink.successful_passes * 0.3)) : 42,
      dlq_pending_count: 0,
      selected_link_title: targetLink ? targetLink.title : 'Seluruh Link Terproteksi (Global)',
      selected_link_target: targetLink ? targetLink.target_redirect_url : null,
      countries: [
        { country: 'ID', count: Math.floor(totalAuth * 0.7) },
        { country: 'SG', count: Math.floor(totalAuth * 0.2) },
        { country: 'US', count: Math.max(1, Math.floor(totalAuth * 0.1)) },
      ],
      recent_logs: filteredLogs.slice(0, 15),
      timestamp: new Date().toISOString(),
    },
  });
}
