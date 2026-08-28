import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../route';
import { db, isSupabaseConfigured } from '../../../../../lib/supabase';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const linkId = params.id;
  const link = protectedLinksStore.find((l) => l.id === linkId || l.slug === linkId);

  if (!link) {
    return NextResponse.json({
      success: false,
      error: { code: 'LINK_NOT_FOUND', message: 'Protected Link not found.' },
    }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: link });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const linkId = params.id;
  const body = await request.json();
  const index = protectedLinksStore.findIndex((l) => l.id === linkId);

  if (index === -1) {
    return NextResponse.json({
      success: false,
      error: { code: 'LINK_NOT_FOUND', message: 'Protected Link not found.' },
    }, { status: 404 });
  }

  protectedLinksStore[index] = {
    ...protectedLinksStore[index],
    ...body,
  };

  if (isSupabaseConfigured()) {
    await db.upsertProtectedLink(protectedLinksStore[index]);
  }

  return NextResponse.json({
    success: true,
    data: protectedLinksStore[index],
    source: isSupabaseConfigured() ? 'supabase' : 'in_memory',
    message: 'Protected Link updated successfully.',
  });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const linkId = params.id;
  const index = protectedLinksStore.findIndex((l) => l.id === linkId);

  if (index !== -1) {
    protectedLinksStore.splice(index, 1);
  }

  if (isSupabaseConfigured()) {
    await db.deleteProtectedLink(linkId);
  }

  return NextResponse.json({
    success: true,
    source: isSupabaseConfigured() ? 'supabase' : 'in_memory',
    message: 'Protected Link deleted successfully.',
  });
}
