import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';
import { credentialsStore } from '../../credentials/tokens/route';
import { auditLogsStore } from '../assertion/route';

// CORS response helper
function corsResponse(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    },
  });
}

export async function OPTIONS() {
  return corsResponse({ success: true });
}

function generateSignedJWT(payload: object): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from(`sig_${Date.now()}_catauth_api_verified`).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { card_id, link_id, client_id, origin_url } = body;

    if (!card_id) {
      return corsResponse({
        success: false,
        authenticated: false,
        error: {
          code: 'MISSING_CARD_ID',
          message: 'Parameter "card_id" (Serial UID / Credential ID) wajib disertakan.',
        },
      }, 400);
    }

    // Normalize card UID
    const normalizedCardId = card_id.startsWith('NFC-UID-') || card_id.startsWith('FIDO2-') 
      ? card_id 
      : `NFC-UID-${card_id.replace(/:/g, '').toUpperCase()}`;

    // Lookup card in credentialsStore
    const matchedCred = credentialsStore.find(
      (c) => c.credential_id === normalizedCardId || c.credential_id === card_id || c.id === card_id
    );

    const cardLabel = matchedCred?.label || `Kartu NFC Fisik (${normalizedCardId.replace('NFC-UID-', '')})`;
    const userId = matchedCred?.user_id || 'usr_demo_john_doe';

    // 1. Check if card is revoked
    if (matchedCred && !matchedCred.is_active) {
      auditLogsStore.unshift({
        id: `log_${Date.now()}`,
        event_type: 'API_VERIFY_REVOKED_BLOCKED',
        link_id: link_id || 'api_direct',
        card_id: normalizedCardId,
        card_label: cardLabel,
        ip_address: '114.122.34.19',
        status: 'SECURITY_BLOCKED',
        created_at: new Date().toISOString(),
      });

      return corsResponse({
        success: false,
        authenticated: false,
        error: {
          code: 'CARD_REVOKED',
          message: `Kartu hardware "${cardLabel}" (${normalizedCardId}) telah dicabut / dinonaktifkan oleh administrator.`,
        },
      }, 403);
    }

    // 2. Check Link Whitelist (if link_id is provided)
    if (link_id) {
      const targetLink = protectedLinksStore.find((l) => l.id === link_id || l.slug === link_id);
      if (targetLink && targetLink.allowed_card_ids && targetLink.allowed_card_ids.length > 0) {
        const isAllowed = targetLink.allowed_card_ids.includes(normalizedCardId) ||
          (matchedCred && targetLink.allowed_card_ids.includes(matchedCred.credential_id));

        if (!isAllowed) {
          targetLink.total_taps += 1;
          targetLink.blocked_attempts += 1;

          auditLogsStore.unshift({
            id: `log_${Date.now()}`,
            event_type: 'API_VERIFY_UNAUTHORIZED_CARD',
            link_id: targetLink.id,
            link_title: targetLink.title,
            card_id: normalizedCardId,
            card_label: cardLabel,
            ip_address: '114.122.34.19',
            status: 'SECURITY_BLOCKED',
            created_at: new Date().toISOString(),
          });

          return corsResponse({
            success: false,
            authenticated: false,
            error: {
              code: 'UNAUTHORIZED_FOR_LINK',
              message: `Kartu "${cardLabel}" (${normalizedCardId}) belum didaftarkan dalam whitelist link "${targetLink.title}".`,
              detected_card_id: normalizedCardId,
            },
          }, 403);
        }

        targetLink.total_taps += 1;
        targetLink.successful_passes += 1;
      }
    }

    // 3. Update sign count & last used
    if (matchedCred) {
      matchedCred.sign_count = (matchedCred.sign_count || 0) + 1;
      matchedCred.last_used_at = new Date().toISOString();
    }

    // 4. Generate Auth JWT Token
    const nowUnix = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: 'https://catauth.io',
      sub: userId,
      aud: link_id || client_id || 'embedded_web_app',
      auth_status: 'SUCCESS',
      auth_method: 'WEBAUTHN_NFC_API',
      card_id: normalizedCardId,
      card_label: cardLabel,
      link_id: link_id || null,
      origin: origin_url || null,
      iat: nowUnix,
      exp: nowUnix + 86400, // 24 hours validity
    };

    const authToken = generateSignedJWT(jwtPayload);

    auditLogsStore.unshift({
      id: `log_${Date.now()}`,
      event_type: 'API_DIRECT_LOGIN_SUCCESS',
      link_id: link_id || 'api_direct',
      card_id: normalizedCardId,
      card_label: cardLabel,
      ip_address: '114.122.34.19',
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    });

    return corsResponse({
      success: true,
      authenticated: true,
      user: {
        user_id: userId,
        name: userId === 'usr_demo_john_doe' ? 'John Doe' : 'Administrator',
        email: `${userId.replace('usr_', '')}@catauth.io`,
        card_id: normalizedCardId,
        card_label: cardLabel,
        sign_count: matchedCred?.sign_count || 1,
        authenticated_at: new Date().toISOString(),
      },
      auth_token: authToken,
      token_type: 'Bearer',
      expires_in: 86400,
      message: `Kartu "${cardLabel}" terverifikasi. Pengguna berhasil diautentikasi.`,
    });
  } catch (err: any) {
    return corsResponse({
      success: false,
      authenticated: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Terjadi kesalahan saat memvalidasi kartu.',
      },
    }, 500);
  }
}
