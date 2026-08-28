import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../route';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const linkId = params.id;
  const link = protectedLinksStore.find((l) => l.id === linkId || l.slug === linkId);

  if (!link) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'LINK_NOT_FOUND',
        message: `Protected link ${linkId} tidak ditemukan.`,
      },
    }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: link,
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const linkId = params.id;
  const index = protectedLinksStore.findIndex((l) => l.id === linkId || l.slug === linkId);

  if (index === -1) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'LINK_NOT_FOUND',
        message: `Protected link ${linkId} tidak ditemukan.`,
      },
    }, { status: 404 });
  }

  const body = await request.json();
  const existing = protectedLinksStore[index];
  const updated = {
    ...existing,
    ...body,
    updated_at: new Date().toISOString(),
  };

  protectedLinksStore[index] = updated;

  return NextResponse.json({
    success: true,
    data: updated,
    message: 'Protected Link updated successfully.',
  });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const linkId = params.id;
  const index = protectedLinksStore.findIndex((l) => l.id === linkId || l.slug === linkId);

  if (index === -1) {
    return NextResponse.json({
      success: false,
      error: {
        code: 'LINK_NOT_FOUND',
        message: `Protected link ${linkId} tidak ditemukan.`,
      },
    }, { status: 404 });
  }

  protectedLinksStore.splice(index, 1);

  return NextResponse.json({
    success: true,
    message: 'Protected Link removed successfully.',
  });
}
