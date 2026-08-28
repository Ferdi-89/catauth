import { NextResponse } from 'next/server';
import { credentialsStore } from '../../../../credentials/tokens/route';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const credentialId = decodeURIComponent(params.id);
  const { searchParams } = new URL(request.url);
  const isActive = searchParams.get('is_active') === 'true';
  const reason = searchParams.get('reason') || '';

  const index = credentialsStore.findIndex((c) => c.credential_id === credentialId || c.id === credentialId);
  if (index === -1) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'CREDENTIAL_NOT_FOUND',
        message: `Kredensial hardware ${credentialId} tidak ditemukan.`,
      },
    }, { status: 404 });
  }

  credentialsStore[index].is_active = isActive;
  if (!isActive) {
    credentialsStore[index].revocation_reason = reason || 'Admin manual revocation';
    credentialsStore[index].revoked_at = new Date().toISOString();
  } else {
    delete credentialsStore[index].revocation_reason;
    delete credentialsStore[index].revoked_at;
  }

  return NextResponse.json({
    success: true,
    data: credentialsStore[index],
    message: `Status token ${credentialId} berhasil diubah menjadi ${isActive ? 'ACTIVE' : 'REVOKED'}.`,
  });
}
