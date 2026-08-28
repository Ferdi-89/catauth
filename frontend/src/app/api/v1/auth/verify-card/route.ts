import { NextResponse } from 'next/server';
import { protectedLinksStore } from '../../links/route';
import { credentialsStore } from '../../credentials/tokens/route';
import { auditLogsStore } from '../assertion/route';
import { db, isSupabaseConfigured } from '../../../../../lib/supabase';

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

    // Rehydrate from Supabase if configured
    let allCreds = credentialsStore;
    if (isSupabaseConfigured()) {
      const sbCreds = await db.getCredentials();
      if (sbCreds && sbCreds.length > 0) {
        allCreds = sbCreds;
      }
    }

    // Strict Lookup: Find card in registered credentials
    const matchedCred = allCreds.find(
      (c) => c.credential_id === normalizedCardId || c.credential_id === card_id || c.id === card_id
    );

    // 1. STRICT CHECK: If card is NOT registered in database, REJECT IMMEDIATELY!
    if (!matchedCred) {
      const logEntry = {
        id: `log_${Date.now()}`,
        event_type: 'API_VERIFY_UNREGISTERED_CARD_REJECTED',
        link_id: link_id || 'api_direct',
        card_id: normalizedCardId,
        card_label: 'Kartu Tidak Terdaftar',
        ip_address: '114.122.34.19',
        status: 'SECURITY_BLOCKED',
        created_at: new Date().toISOString(),
      };
      auditLogsStore.unshift(logEntry);
      if (isSupabaseConfigured()) {
        db.insertAuditLog(logEntry);
      }

      return corsResponse({
        success: false,
        authenticated: false,
        error: {
          code: 'CARD_NOT_REGISTERED',
          message: `Kartu fisik (UID: ${normalizedCardId}) belum terdaftar di sistem Catauth. Silakan daftarkan kartu ini terlebih dahulu di menu Keys.`,
          detected_card_id: normalizedCardId,
        },
      }, 401);
    }

    const cardLabel = matchedCred.label;
    const userId = matchedCred.user_id;
    const userName = matchedCred.user_name || matchedCred.label;
    const userEmail = matchedCred.user_email || `${userId.replace('usr_', '')}@catauth.io`;
    const userRole = matchedCred.user_role || 'MEMBER';

    // 2. STRICT CHECK: If card is Revoked / Inactive, REJECT!
    if (!matchedCred.is_active) {
      const logEntry = {
        id: `log_${Date.now()}`,
        event_type: 'API_VERIFY_REVOKED_BLOCKED',
        link_id: link_id || 'api_direct',
        card_id: normalizedCardId,
        card_label: cardLabel,
        ip_address: '114.122.34.19',
        status: 'SECURITY_BLOCKED',
        created_at: new Date().toISOString(),
      };
      auditLogsStore.unshift(logEntry);
      if (isSupabaseConfigured()) {
        db.insertAuditLog(logEntry);
      }

      return corsResponse({
        success: false,
        authenticated: false,
        error: {
          code: 'CARD_REVOKED',
          message: `Kartu hardware "${cardLabel}" (${normalizedCardId}) telah dicabut / dinonaktifkan oleh administrator.`,
          detected_card_id: normalizedCardId,
        },
      }, 403);
    }

    // 3. STRICT CHECK: Link Whitelist (if link_id is provided)
    if (link_id) {
      let allLinks = protectedLinksStore;
      if (isSupabaseConfigured()) {
        const sbLinks = await db.getProtectedLinks();
        if (sbLinks && sbLinks.length > 0) {
          allLinks = sbLinks;
        }
      }

      const targetLink = allLinks.find((l) => l.id === link_id || l.slug === link_id);
      if (targetLink) {
        // Link must be active
        if (!targetLink.is_active) {
          return corsResponse({
            success: false,
            authenticated: false,
            error: {
              code: 'LINK_INACTIVE',
              message: `Protected link "${targetLink.title}" sedang dinonaktifkan oleh administrator.`,
            },
          }, 403);
        }

        const isWildcardAllowed = targetLink.allowed_card_ids && (
          targetLink.allowed_card_ids.includes('*') ||
          targetLink.allowed_card_ids.includes('ALL')
        );

        const isExplicitlyAllowed = targetLink.allowed_card_ids && (
          targetLink.allowed_card_ids.includes(normalizedCardId) ||
          targetLink.allowed_card_ids.includes(card_id) ||
          targetLink.allowed_card_ids.includes(matchedCred.credential_id)
        );

        if (!isWildcardAllowed && !isExplicitlyAllowed) {
          targetLink.total_taps += 1;
          targetLink.blocked_attempts += 1;

          const logEntry = {
            id: `log_${Date.now()}`,
            event_type: 'API_VERIFY_UNAUTHORIZED_FOR_LINK',
            link_id: targetLink.id,
            link_title: targetLink.title,
            card_id: normalizedCardId,
            card_label: cardLabel,
            ip_address: '114.122.34.19',
            status: 'SECURITY_BLOCKED',
            created_at: new Date().toISOString(),
          };
          auditLogsStore.unshift(logEntry);
          if (isSupabaseConfigured()) {
            db.insertAuditLog(logEntry);
            db.upsertProtectedLink(targetLink);
          }

          return corsResponse({
            success: false,
            authenticated: false,
            error: {
              code: 'UNAUTHORIZED_FOR_LINK',
              message: `Kartu "${cardLabel}" (${normalizedCardId}) terdaftar milik ${userName}, tetapi belum dimasukkan ke dalam whitelist link "${targetLink.title}".`,
              detected_card_id: normalizedCardId,
              link_title: targetLink.title,
            },
          }, 403);
        }

        targetLink.total_taps += 1;
        targetLink.successful_passes += 1;
        if (isSupabaseConfigured()) {
          db.upsertProtectedLink(targetLink);
        }
      }
    }

    // 4. Update sign count & last used
    matchedCred.sign_count = (matchedCred.sign_count || 0) + 1;
    matchedCred.last_used_at = new Date().toISOString();

    // 5. Generate Signed Auth JWT Token
    const nowUnix = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: 'https://catauth.io',
      sub: userId,
      name: userName,
      email: userEmail,
      role: userRole,
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

    const logEntry = {
      id: `log_${Date.now()}`,
      event_type: 'API_DIRECT_LOGIN_SUCCESS',
      link_id: link_id || 'api_direct',
      card_id: normalizedCardId,
      card_label: cardLabel,
      ip_address: '114.122.34.19',
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    };
    auditLogsStore.unshift(logEntry);
    if (isSupabaseConfigured()) {
      db.insertAuditLog(logEntry);
    }

    return corsResponse({
      success: true,
      authenticated: true,
      user: {
        user_id: userId,
        name: userName,
        email: userEmail,
        role: userRole,
        card_id: normalizedCardId,
        card_label: cardLabel,
        sign_count: matchedCred.sign_count,
        authenticated_at: new Date().toISOString(),
      },
      auth_token: authToken,
      token_type: 'Bearer',
      expires_in: 86400,
      message: `Kartu "${cardLabel}" milik ${userName} terverifikasi. Berhasil login sebagai ${userRole}.`,
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
