import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const accessToken = `catauth_at_${Math.random().toString(36).substring(2, 20)}_${Date.now()}`;
  const idToken = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfZGVtb19qb2huX2RvZSIsIm5hbWUiOiJKb2huIERvZSIsImVtYWlsIjoiam9obi5kb2VAY2F0YXV0aC5pbyIsImlzcyI6Imh0dHBzOi8vY2F0YXV0aC5pbyIsImF1ZCI6ImNsaWVudF9wb3J0YWxfYWxwaGEiLCJpYXQiOjE3ODc5MjQ3MDAsImV4cCI6MTc4Nzk2MDcwMH0.signature`;

  return NextResponse.json({
    success: true,
    access_token: accessToken,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid profile email fido2',
    data: {
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
    },
    message: 'OAuth2 token exchanged successfully (Nodes 34-39).',
  });
}
